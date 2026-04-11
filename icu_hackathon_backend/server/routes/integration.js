const express = require("express");

const hl7IngestionService = require("../services/hl7IngestionService");
const serialBridge = require("../services/serialBridge");
const { getWhatsAppIntegrationStatus } = require("../services/whatsappService");
const { dispatchCriticalEscalation } = require("../services/escalationDispatcher");

const router = express.Router();

function toTimestampMs(value) {
  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveLastMessageReceived(hl7Timestamp, serialTimestamp) {
  const candidates = [
    { raw: hl7Timestamp, ms: toTimestampMs(hl7Timestamp) },
    { raw: serialTimestamp, ms: toTimestampMs(serialTimestamp) },
  ].filter((entry) => entry.ms !== null);

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => b.ms - a.ms);
  return String(candidates[0].raw);
}

router.get("/status", (_req, res) => {
  const hl7Status = hl7IngestionService.getHl7IngestionStatus();
  const serialStatus = serialBridge.getSerialBridgeStatus();

  return res.status(200).json({
    hl7_listener: hl7Status.running ? "running" : "stopped",
    serial_bridge: serialStatus.running ? "running" : "stopped",
    last_message_received: resolveLastMessageReceived(
      hl7Status.lastMessageReceived,
      serialStatus.lastMessageReceived
    ),
  });
});

router.get("/whatsapp-status", (_req, res) => {
  const status = getWhatsAppIntegrationStatus();

  return res.status(200).json({
    status: status.status,
    tokenConfigured: status.tokenConfigured,
    phoneNumberConfigured: status.phoneNumberConfigured,
    reason: status.reason || null,
  });
});

router.get("/test-whatsapp-alert", async (req, res) => {
  try {
    const whatsappStatus = getWhatsAppIntegrationStatus();
    if (whatsappStatus.status !== "active") {
      return res.status(200).json({
        status: "inactive",
        message: "WhatsApp integration configured but inactive",
        whatsappStatus,
      });
    }

    const patientId = String(req?.query?.patientId || "test-whatsapp-patient").trim() || "test-whatsapp-patient";
    const recipient = String(req?.query?.recipient || "").trim();

    const escalation = await dispatchCriticalEscalation({
      alertEvent: {
        patientId,
        alertType: "critical-alert",
        riskScore: 95,
        reason: "Manual WhatsApp escalation test trigger",
        timestamp: new Date().toISOString(),
        vitals: {
          heartRate: 128,
          spo2: 82,
          temperature: 39.2,
          bloodPressure: "88/54",
        },
        whatsappRecipients: recipient ? [recipient] : undefined,
      },
    });

    return res.status(200).json({
      status: "ok",
      message: "CRITICAL alert escalation simulated",
      patientId,
      escalationChannels: escalation.channels,
      alert: escalation.alert,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not run WhatsApp alert test",
    });
  }
});

module.exports = router;