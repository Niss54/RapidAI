const { synthesizeSpeech } = require("./ttsService");
const { broadcastVoiceMessage } = require("./livekitService");
const { getLanguage, normalizeLanguage, activateAlertMode } = require("./sessionState");

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

async function announceCriticalAlert(patientId) {
  const language = normalizeLanguage(getLanguage());
  const text = buildCriticalAlertText(patientId, language);

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

  return {
    text,
    language,
    audioBase64,
    delivered: delivery.delivered,
    deliveryReason: delivery.reason || null,
  };
}

module.exports = {
  announceCriticalAlert,
};
