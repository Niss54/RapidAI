const { synthesizeSpeech } = require("./ttsService");
const { broadcastVoiceMessage } = require("./livekitService");
const { getLanguage, normalizeLanguage, activateAlertMode } = require("./sessionState");
const { sendWhatsAppAlert } = require("./whatsappService");

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBloodPressure(bloodPressure) {
  const raw = String(bloodPressure || "").trim();
  if (!raw) {
    return { systolic: null, diastolic: null };
  }

  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return { systolic: null, diastolic: null };
  }

  return {
    systolic: toFiniteNumber(match[1]),
    diastolic: toFiniteNumber(match[2]),
  };
}

function resolveWhatsAppRecipients(explicitRecipients) {
  if (Array.isArray(explicitRecipients)) {
    return explicitRecipients
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  }

  const raw = String(
    explicitRecipients ||
      process.env.WHATSAPP_ALERT_RECIPIENTS ||
      process.env.WHATSAPP_ALERT_RECIPIENT ||
      process.env.WHATSAPP_RECIPIENT ||
      process.env.WHATSAPP_DOCTOR_NUMBER ||
      ""
  ).trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function derivePrimaryAbnormalVital(vitals, fallbackReason) {
  const data = vitals && typeof vitals === "object" ? vitals : {};
  const heartRate = toFiniteNumber(data.heartRate);
  const spo2 = toFiniteNumber(data.spo2);
  const temperature = toFiniteNumber(data.temperature);
  const { systolic, diastolic } = parseBloodPressure(data.bloodPressure);

  const candidates = [];

  if (spo2 !== null && spo2 < 95) {
    candidates.push({
      severity: 95 - spo2,
      label: `SpO2 ${spo2}% (low)`,
    });
  }

  if (heartRate !== null && (heartRate < 60 || heartRate > 100)) {
    const severity = heartRate < 60 ? 60 - heartRate : heartRate - 100;
    candidates.push({
      severity,
      label: `Heart Rate ${heartRate} bpm (${heartRate < 60 ? "low" : "high"})`,
    });
  }

  if (temperature !== null && (temperature < 36 || temperature > 37.5)) {
    const severity = temperature < 36 ? 36 - temperature : temperature - 37.5;
    candidates.push({
      severity,
      label: `Temperature ${temperature.toFixed(1)} C (${temperature < 36 ? "low" : "high"})`,
    });
  }

  if (systolic !== null && (systolic < 100 || systolic > 160)) {
    const severity = systolic < 100 ? 100 - systolic : systolic - 160;
    candidates.push({
      severity,
      label: `Blood Pressure ${systolic}/${diastolic || "?"} mmHg (systolic ${
        systolic < 100 ? "low" : "high"
      })`,
    });
  }

  if (diastolic !== null && (diastolic < 60 || diastolic > 100)) {
    const severity = diastolic < 60 ? 60 - diastolic : diastolic - 100;
    candidates.push({
      severity,
      label: `Blood Pressure ${systolic || "?"}/${diastolic} mmHg (diastolic ${
        diastolic < 60 ? "low" : "high"
      })`,
    });
  }

  if (candidates.length === 0) {
    const reason = String(fallbackReason || "").trim();
    return reason || "Multiple vitals outside safe range";
  }

  candidates.sort((a, b) => b.severity - a.severity);
  return candidates[0].label;
}

function buildCriticalWhatsAppMessage(patientId, alertContext) {
  const timestamp = String(alertContext?.timestamp || new Date().toISOString()).trim();
  const riskScoreValue = toFiniteNumber(alertContext?.riskScore);
  const riskScore = riskScoreValue === null ? "N/A" : String(Math.round(riskScoreValue));
  const primaryAbnormalVital = derivePrimaryAbnormalVital(alertContext?.vitals, alertContext?.reason);

  return [
    "CRITICAL ALERT",
    `Patient ID: ${patientId}`,
    `Risk Score: ${riskScore}`,
    `Primary abnormal vital: ${primaryAbnormalVital}`,
    `Timestamp: ${timestamp}`,
  ].join("\n");
}

function buildCriticalAlertText(patientId, language) {
  const lang = normalizeLanguage(language);

  if (lang === "hi") {
    return `रोगी ${patientId} के लिए ऑक्सीजन स्तर में गंभीर गिरावट पाई गई है।`;
  }

  if (lang === "bn") {
    return `রোগী ${patientId} এর অক্সিজেন স্তরে গুরুতর পতন ধরা পড়েছে।`;
  }

  if (lang === "ta") {
    return `நோயாளர் ${patientId} க்கு ஆக்சிஜன் அளவு ஆபத்தாக குறைந்துள்ளது.`;
  }

  if (lang === "te") {
    return `పేషెంట్ ${patientId} కి ఆక్సిజన్ స్థాయి ప్రమాదకరంగా పడిపోయింది.`;
  }

  if (lang === "mr") {
    return `रुग्ण ${patientId} साठी ऑक्सिजन पातळीमध्ये गंभीर घट आढळली आहे.`;
  }

  return `Critical oxygen drop detected for patient ${patientId}.`;
}

async function announceCriticalAlert(patientId, alertContext = {}) {
  const language = normalizeLanguage(getLanguage());
  const text = buildCriticalAlertText(patientId, language);
  const whatsappMessage = buildCriticalWhatsAppMessage(patientId, alertContext);
  const recipients = resolveWhatsAppRecipients(alertContext.whatsappRecipients);

  activateAlertMode({
    patientId,
    message: text,
    language,
    durationMs: Number(process.env.ALERT_VOICE_LOCK_MS || 18000),
  });

  let audioBase64 = null;

  try {
    const audioBuffer = await synthesizeSpeech(text, language);
    if (audioBuffer.length > 0) {
      audioBase64 = audioBuffer.toString("base64");
    }
  } catch {
    audioBase64 = null;
  }

  const delivery = await broadcastVoiceMessage({
    text,
    language,
    audioBase64,
    eventType: "critical-alert",
  });

  let whatsapp = {
    attempted: false,
    sent: false,
    reason: "no-recipient",
    sentCount: 0,
    recipients,
    results: [],
  };

  if (recipients.length > 0) {
    const settledResults = await Promise.allSettled(
      recipients.map((recipient) => sendWhatsAppAlert(whatsappMessage, recipient))
    );

    const results = settledResults.map((result, index) => {
      const recipient = recipients[index];
      if (result.status === "fulfilled") {
        return {
          recipient,
          ...result.value,
        };
      }

      return {
        recipient,
        sent: false,
        reason: "request-failed",
        error: result.reason instanceof Error ? result.reason.message : String(result.reason || "Unknown error"),
      };
    });

    const sentCount = results.filter((item) => item.sent).length;
    const firstFailure = results.find((item) => !item.sent);

    whatsapp = {
      attempted: true,
      sent: sentCount > 0,
      reason: sentCount > 0 ? null : firstFailure?.reason || "request-failed",
      sentCount,
      recipients,
      results,
    };
  }

  return {
    text,
    language,
    audioBase64,
    delivered: delivery.delivered,
    deliveryReason: delivery.reason || null,
    whatsappMessage,
    whatsapp,
  };
}

module.exports = {
  announceCriticalAlert,
};
