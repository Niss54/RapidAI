const { announceCriticalAlert } = require("./alertSpeaker");
const { logAlertEvent } = require("../models/EventLog");

function toErrorMessage(error, fallback) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function buildFallbackVoiceAlert(patientId) {
  return {
    text: `Critical oxygen drop detected for patient ${patientId}.`,
    language: "en",
    audioBase64: null,
    delivered: false,
    deliveryReason: "voice-broadcast-failed",
    whatsappMessage: null,
    whatsapp: {
      attempted: false,
      sent: false,
      reason: "not-attempted",
      sentCount: 0,
      recipients: [],
      results: [],
    },
  };
}

async function dispatchCriticalEscalation({ alertEvent }) {
  const patientId = String(alertEvent?.patientId || "").trim();
  if (!patientId) {
    throw new Error("dispatchCriticalEscalation requires alertEvent.patientId");
  }

  const alertContext = {
    riskScore: alertEvent?.riskScore,
    reason: alertEvent?.reason,
    timestamp: alertEvent?.timestamp,
    vitals: alertEvent?.vitals,
    whatsappRecipients: alertEvent?.whatsappRecipients,
  };

  const channels = {
    voiceBroadcast: {
      attempted: true,
      delivered: false,
      reason: null,
    },
    dashboardAlertStream: {
      attempted: true,
      delivered: false,
      reason: null,
    },
    whatsappEscalation: {
      attempted: false,
      sent: false,
      reason: "not-attempted",
      sentCount: 0,
      recipients: [],
      results: [],
    },
  };

  let voiceAlert = null;

  try {
    voiceAlert = await announceCriticalAlert(patientId, alertContext);
  } catch (error) {
    const reason = toErrorMessage(error, "voice-broadcast-failed");
    voiceAlert = {
      ...buildFallbackVoiceAlert(patientId),
      deliveryReason: reason,
    };
    channels.voiceBroadcast.reason = reason;
  }

  const voiceDelivered = Boolean(voiceAlert?.delivered);
  channels.voiceBroadcast.delivered = voiceDelivered;
  channels.voiceBroadcast.reason = voiceDelivered
    ? null
    : String(voiceAlert?.deliveryReason || channels.voiceBroadcast.reason || "voice-broadcast-failed");

  const whatsappResult =
    voiceAlert?.whatsapp && typeof voiceAlert.whatsapp === "object"
      ? voiceAlert.whatsapp
      : buildFallbackVoiceAlert(patientId).whatsapp;

  channels.whatsappEscalation = {
    attempted: Boolean(whatsappResult.attempted),
    sent: Boolean(whatsappResult.sent),
    reason: whatsappResult.reason || null,
    sentCount: Number.isFinite(Number(whatsappResult.sentCount))
      ? Math.max(0, Number(whatsappResult.sentCount))
      : 0,
    recipients: Array.isArray(whatsappResult.recipients) ? whatsappResult.recipients : [],
    results: Array.isArray(whatsappResult.results) ? whatsappResult.results : [],
  };

  const deliveryChannels = ["dashboard", "voice"];
  if (channels.whatsappEscalation.attempted) {
    deliveryChannels.push("whatsapp");
  }

  try {
    await logAlertEvent({
      patientId,
      alertType: String(alertEvent?.alertType || "critical-alert"),
      language: String(voiceAlert?.language || "en"),
      message: String(voiceAlert?.text || buildFallbackVoiceAlert(patientId).text),
      delivered: voiceDelivered,
      deliveryReason: voiceDelivered ? null : channels.voiceBroadcast.reason,
      deliveryChannels,
    });

    channels.dashboardAlertStream.delivered = true;
    channels.dashboardAlertStream.reason = null;
  } catch (error) {
    channels.dashboardAlertStream.delivered = false;
    channels.dashboardAlertStream.reason = toErrorMessage(error, "dashboard-alert-log-failed");
  }

  return {
    alert: {
      text: String(voiceAlert?.text || buildFallbackVoiceAlert(patientId).text),
      language: String(voiceAlert?.language || "en"),
      audioBase64: voiceAlert?.audioBase64 || null,
      delivered: voiceDelivered,
      deliveryReason: voiceDelivered ? null : channels.voiceBroadcast.reason,
      whatsappMessage: voiceAlert?.whatsappMessage || null,
      whatsapp: channels.whatsappEscalation,
    },
    channels,
  };
}

module.exports = {
  dispatchCriticalEscalation,
};
