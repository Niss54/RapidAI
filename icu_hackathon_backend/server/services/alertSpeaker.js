const { synthesizeSpeech } = require("./ttsService");
const { broadcastVoiceMessage } = require("./livekitService");
const { getLanguage } = require("./sessionState");

function buildCriticalAlertText(patientId, language) {
  if (language === "hi") {
    return `रोगी ${patientId} के लिए ऑक्सीजन स्तर में गंभीर गिरावट पाई गई है।`;
  }

  return `Critical oxygen drop detected for patient ${patientId}.`;
}

async function announceCriticalAlert(patientId) {
  const language = getLanguage();
  const text = buildCriticalAlertText(patientId, language);
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
