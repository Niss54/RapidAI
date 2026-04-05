const { transcribeAudio } = require("./sttService");
const { detectIntent } = require("./llmService");
const { synthesizeSpeech } = require("./ttsService");
const { broadcastVoiceMessage } = require("./livekitService");
const { getLanguage, setLanguage } = require("./sessionState");
const Patient = require("../models/Patient");
const { logVoiceInteraction } = require("../models/EventLog");

function patientStatusText(patient, language) {
  if (!patient) {
    return language === "hi" ? "रोगी का डेटा उपलब्ध नहीं है।" : "Patient data is not available.";
  }

  if (language === "hi") {
    return `रोगी ${patient.patientId} का ऑक्सीजन स्तर ${patient.spo2}, हार्ट रेट ${patient.heartRate} और जोखिम स्तर ${patient.riskLevel} है।`;
  }

  return `Patient ${patient.patientId} oxygen level ${patient.spo2} and heart rate ${patient.heartRate}. Risk ${patient.riskLevel}.`;
}

function summaryText(summary, language) {
  if (language === "hi") {
    return `आईसीयू सारांश: गंभीर ${summary.critical}, मॉडरेट ${summary.moderate}, स्थिर ${summary.stable} रोगी।`;
  }

  return `ICU summary: ${summary.critical} critical, ${summary.moderate} moderate, ${summary.stable} stable patients.`;
}

async function processVoiceQuery({ audioBuffer, text, language }) {
  const activeLanguage = language === "hi" || language === "en" ? language : getLanguage();

  const transcript = text && text.trim().length > 0
    ? text.trim()
    : await transcribeAudio(audioBuffer, activeLanguage);

  if (!transcript) {
    throw new Error("Could not recognize doctor command");
  }

  const intentResult = await detectIntent(transcript);
  let responseLanguage = activeLanguage;
  let responseText = "";

  if (intentResult.intent === "LANGUAGE_SWITCH") {
    responseLanguage = setLanguage(intentResult.language || "en");
    responseText =
      responseLanguage === "hi"
        ? "भाषा हिंदी में बदल दी गई है।"
        : "Language switched to English.";
  } else if (intentResult.intent === "PATIENT_STATUS") {
    const patientId = intentResult.patientId;
    const patient = patientId ? await Patient.getPatientById(patientId) : null;
    responseText = patientStatusText(patient, responseLanguage);
  } else {
    const { summary } = await Patient.summarizePatients();
    responseText = summaryText(summary, responseLanguage);
  }

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
    patientId: intentResult.patientId,
    language: responseLanguage,
    responseText,
    source: text && text.trim().length > 0 ? "text" : "audio",
  });

  return {
    transcript,
    intent: intentResult.intent,
    patientId: intentResult.patientId,
    language: responseLanguage,
    responseText,
    audioBase64,
  };
}

module.exports = {
  processVoiceQuery,
};
