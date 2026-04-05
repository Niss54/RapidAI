const { transcribeAudio } = require("./sttService");
const { detectIntent } = require("./llmService");
const { synthesizeSpeech } = require("./ttsService");
const { broadcastVoiceMessage } = require("./livekitService");
const {
  getLanguage,
  setLanguage,
  normalizeLanguage,
  shouldSpeakIntroduction,
  getAlertMode,
} = require("./sessionState");
const Patient = require("../models/Patient");
const { logVoiceInteraction } = require("../models/EventLog");

const DUMMY_PATIENTS = {
  "201": {
    patientId: "201",
    patientName: "Aarav Sharma",
    heartRate: 97,
    spo2: 98,
    temperature: 98.4,
    bloodPressure: "118/76",
    riskLevel: "STABLE",
  },
  "202": {
    patientId: "202",
    patientName: "Meera Singh",
    heartRate: 116,
    spo2: 92,
    temperature: 99.2,
    bloodPressure: "126/84",
    riskLevel: "MODERATE",
  },
  "203": {
    patientId: "203",
    patientName: "Kabir Patel",
    heartRate: 124,
    spo2: 86,
    temperature: 101.1,
    bloodPressure: "132/90",
    riskLevel: "CRITICAL",
  },
  "204": {
    patientId: "204",
    patientName: "Ananya Rao",
    heartRate: 108,
    spo2: 94,
    temperature: 99.0,
    bloodPressure: "121/82",
    riskLevel: "WARNING",
  },
};

function greetingText(language) {
  const lang = normalizeLanguage(language);
  const intro = "Hello, I am Rapid AI.";

  if (lang === "hi") {
    return `${intro} नमस्ते, मैं रैपिड एआई हूं।`;
  }

  if (lang === "bn") {
    return `${intro} হ্যালো, আমি র‍্যাপিড এআই।`;
  }

  if (lang === "ta") {
    return `${intro} வணக்கம், நான் ரேபிட் ஏஐ.`;
  }

  if (lang === "te") {
    return `${intro} హలో, నేను రాపిడ్ ఏఐ.`;
  }

  if (lang === "mr") {
    return `${intro} नमस्कार, मी रॅपिड एआय आहे.`;
  }

  return intro;
}

function languageSwitchText(language) {
  const lang = normalizeLanguage(language);

  if (lang === "hi") {
    return "भाषा हिंदी में बदल दी गई है।";
  }

  if (lang === "bn") {
    return "ভাষা বাংলায় পরিবর্তন করা হয়েছে।";
  }

  if (lang === "ta") {
    return "மொழி தமிழாக மாற்றப்பட்டது.";
  }

  if (lang === "te") {
    return "భాష తెలుగులోకి మార్చబడింది.";
  }

  if (lang === "mr") {
    return "भाषा मराठीत बदलली आहे.";
  }

  return "Language switched to English.";
}

function askPatientIdentityText(language) {
  const lang = normalizeLanguage(language);

  if (lang === "hi") {
    return "कृपया रोगी का नाम और रोगी नंबर बताइए। उदाहरण: patient 203, name Ananya.";
  }

  return "Please tell patient name and patient number first. Example: patient 203, name Ananya.";
}

function alertLockText(alertState, language) {
  const lang = normalizeLanguage(language);
  const patientPart = alertState?.patientId ? ` ${alertState.patientId}` : "";

  if (lang === "hi") {
    return `क्रिटिकल अलर्ट सक्रिय है${patientPart ? `, रोगी ${patientPart.trim()}` : ""}। अभी रैपिड एआई केवल अलर्ट प्रसारित करेगा, कृपया कुछ क्षण प्रतीक्षा करें।`;
  }

  return `Critical alert mode is active${patientPart ? ` for patient ${patientPart.trim()}` : ""}. Rapid AI is broadcasting emergency alert only. Please wait.`;
}

function extractPatientIdFromText(text) {
  const normalized = String(text || "");
  const match = normalized.match(/(?:patient|pt|mrn|मरीज|रोगी)\s*([a-z0-9_-]+)/i);
  return match ? String(match[1]) : null;
}

function sanitizeExtractedName(rawName) {
  if (!rawName) {
    return null;
  }

  const cleaned = String(rawName)
    .replace(/\b(status|condition|risk|detail|details|summary|report|oxygen|spo2|heart|bp|temperature)\b.*$/i, "")
    .replace(/[\s,;:.]+$/g, "")
    .trim();

  return cleaned || null;
}

function extractPatientNameFromText(text) {
  const normalized = String(text || "");

  const english = normalized.match(/(?:name\s*(?:is)?\s*)([a-z][a-z\s'-]{1,40})/i);
  if (english) {
    return sanitizeExtractedName(english[1]);
  }

  const hindi = normalized.match(/(?:नाम\s*)([\u0900-\u097fa-zA-Z\s'-]{1,40})/i);
  if (hindi) {
    return sanitizeExtractedName(hindi[1]);
  }

  return null;
}

function withIntroIfNeeded(responseText, language, userId) {
  if (!shouldSpeakIntroduction(userId)) {
    return responseText;
  }

  return `${greetingText(language)} ${responseText}`;
}

function patientStatusText(patient, language, explicitName) {
  if (!patient) {
    return askPatientIdentityText(language);
  }

  const patientName = explicitName || patient.patientName || "Unknown";
  const lang = normalizeLanguage(language);

  if (lang === "hi") {
    return `रोगी ${patient.patientId}, नाम ${patientName}: ऑक्सीजन स्तर ${patient.spo2}, हार्ट रेट ${patient.heartRate}, तापमान ${patient.temperature}, ब्लड प्रेशर ${patient.bloodPressure}, जोखिम स्तर ${patient.riskLevel} है।`;
  }

  if (lang === "mr") {
    return `रुग्ण ${patient.patientId}, नाव ${patientName}: ऑक्सिजन ${patient.spo2}, हृदयगती ${patient.heartRate}, तापमान ${patient.temperature}, रक्तदाब ${patient.bloodPressure}, जोखीम स्तर ${patient.riskLevel}.`;
  }

  return `Patient ${patient.patientId}, name ${patientName}: oxygen ${patient.spo2}, heart rate ${patient.heartRate}, temperature ${patient.temperature}, blood pressure ${patient.bloodPressure}, risk ${patient.riskLevel}.`;
}

function summaryText(summary, language, source = "live") {
  const tag = source === "dummy" ? " (demo training data)" : "";
  const lang = normalizeLanguage(language);

  if (lang === "hi") {
    return `आईसीयू सारांश${source === "dummy" ? " (डेमो डेटा)" : ""}: गंभीर ${summary.critical}, मॉडरेट ${summary.moderate}, चेतावनी ${summary.warning}, स्थिर ${summary.stable}, कुल ${summary.total} रोगी।`;
  }

  if (lang === "mr") {
    return `आयसीयू सारांश${source === "dummy" ? " (डेमो डेटा)" : ""}: गंभीर ${summary.critical}, मॉडरेट ${summary.moderate}, वॉर्निंग ${summary.warning}, स्थिर ${summary.stable}, एकूण ${summary.total} रुग्ण.`;
  }

  return `ICU summary${tag}: ${summary.critical} critical, ${summary.moderate} moderate, ${summary.warning} warning, ${summary.stable} stable, total ${summary.total} patients.`;
}

function getDummySummary() {
  const patients = Object.values(DUMMY_PATIENTS);
  const summary = {
    critical: 0,
    moderate: 0,
    warning: 0,
    stable: 0,
    total: patients.length,
  };

  for (const patient of patients) {
    const risk = String(patient.riskLevel || "STABLE").toUpperCase();
    if (risk === "CRITICAL") {
      summary.critical += 1;
    } else if (risk === "MODERATE") {
      summary.moderate += 1;
    } else if (risk === "WARNING") {
      summary.warning += 1;
    } else {
      summary.stable += 1;
    }
  }

  return { summary, patients };
}

async function resolvePatientProfile(patientId, nameHint) {
  const normalizedId = String(patientId);
  const realPatient = await Patient.getPatientById(normalizedId);
  const dummy = DUMMY_PATIENTS[normalizedId];

  if (!realPatient && !dummy) {
    return null;
  }

  const base = realPatient ? { ...realPatient } : { ...dummy };
  base.patientId = normalizedId;
  base.patientName = nameHint || dummy?.patientName || base.patientName || "Unknown";
  return base;
}

async function processVoiceQuery({ audioBuffer, text, language, userId }) {
  const activeLanguage = normalizeLanguage(language || getLanguage());
  const alertState = getAlertMode();

  if (alertState.active) {
    const responseLanguage = normalizeLanguage(alertState.language || activeLanguage);
    const transcript = text && text.trim().length > 0 ? text.trim() : "[input-blocked-during-alert]";
    const responseText = alertLockText(alertState, responseLanguage);

    let audioBase64 = null;
    try {
      const speechBuffer = await synthesizeSpeech(responseText, responseLanguage);
      if (speechBuffer.length > 0) {
        audioBase64 = speechBuffer.toString("base64");
      }
    } catch {
      audioBase64 = null;
    }

    await broadcastVoiceMessage({
      text: responseText,
      language: responseLanguage,
      audioBase64,
      eventType: "critical-alert",
    });

    await logVoiceInteraction({
      transcript,
      intent: "ALERT_LOCK",
      patientId: alertState.patientId || null,
      language: responseLanguage,
      responseText,
      source: text && text.trim().length > 0 ? "text" : "audio",
    });

    return {
      transcript,
      intent: "ALERT_LOCK",
      patientId: alertState.patientId || null,
      language: responseLanguage,
      responseText,
      audioBase64,
    };
  }

  const transcript = text && text.trim().length > 0
    ? text.trim()
    : await transcribeAudio(audioBuffer, activeLanguage);

  if (!transcript) {
    throw new Error("Could not recognize doctor command");
  }

  const intentResult = await detectIntent(transcript);
  let responseLanguage = normalizeLanguage(activeLanguage);
  let responseText = "";

  if (intentResult.intent === "LANGUAGE_SWITCH") {
    responseLanguage = setLanguage(intentResult.language || activeLanguage);
    responseText = languageSwitchText(responseLanguage);
  } else if (intentResult.intent === "PATIENT_STATUS") {
    const inferredPatientId = intentResult.patientId || extractPatientIdFromText(transcript);
    const inferredPatientName = extractPatientNameFromText(transcript);

    if (!inferredPatientId) {
      responseText = askPatientIdentityText(responseLanguage);
    } else {
      const patient = await resolvePatientProfile(inferredPatientId, inferredPatientName);
      responseText = patientStatusText(patient, responseLanguage, inferredPatientName);
      if (patient && !inferredPatientName) {
        responseText +=
          normalizeLanguage(responseLanguage) === "hi"
            ? " कृपया रोगी का नाम भी बताएं ताकि रिकॉर्ड मैच हो सके।"
            : " Please also confirm patient name so records can be matched.";
      }
    }
  } else {
    const { summary, patients } = await Patient.summarizePatients();

    if (!patients || patients.length === 0) {
      const dummy = getDummySummary();
      responseText = summaryText(dummy.summary, responseLanguage, "dummy");
    } else {
      responseText = summaryText(summary, responseLanguage, "live");
    }
  }

  responseText = withIntroIfNeeded(responseText, responseLanguage, userId);

  let audioBase64 = null;
  try {
    const speechBuffer = await synthesizeSpeech(responseText, responseLanguage);
    if (speechBuffer.length > 0) {
      audioBase64 = speechBuffer.toString("base64");
    }
  } catch {
    audioBase64 = null;
  }

  await broadcastVoiceMessage({
    text: responseText,
    language: responseLanguage,
    audioBase64,
    eventType: "doctor-response",
  });

  await logVoiceInteraction({
    transcript,
    intent: intentResult.intent,
    patientId: intentResult.patientId || extractPatientIdFromText(transcript),
    language: responseLanguage,
    responseText,
    source: text && text.trim().length > 0 ? "text" : "audio",
  });

  const resolvedPatientId = intentResult.patientId || extractPatientIdFromText(transcript) || null;

  return {
    transcript,
    intent: intentResult.intent,
    patientId: resolvedPatientId,
    language: responseLanguage,
    responseText,
    audioBase64,
  };
}

module.exports = {
  processVoiceQuery,
};
