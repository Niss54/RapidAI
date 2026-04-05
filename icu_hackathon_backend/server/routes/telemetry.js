const express = require("express");
const { analyzeRisk } = require("../services/riskAnalyzer");
const Patient = require("../models/Patient");
const { logTelemetryEvent, logAlertEvent } = require("../models/EventLog");
const { announceCriticalAlert } = require("../services/alertSpeaker");

const router = express.Router();

router.post("/update", async (req, res) => {
  try {
    const { patientId, heartRate, spo2, temperature, bloodPressure } = req.body || {};

    if (!patientId) {
      return res.status(400).json({ error: "patientId is required" });
    }

    const risk = analyzeRisk({ patientId, heartRate, spo2, temperature });
    const patient = await Patient.upsertPatient({
      patientId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
      riskLevel: risk.riskLevel,
    });

    await logTelemetryEvent({
      patientId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
      riskLevel: risk.riskLevel,
      reason: risk.reason,
    });

    let alert = null;
    if (risk.riskLevel === "CRITICAL") {
      alert = await announceCriticalAlert(patientId);
      await logAlertEvent({
        patientId,
        alertType: "critical-alert",
        language: alert.language,
        message: alert.text,
        delivered: alert.delivered,
        deliveryReason: alert.deliveryReason,
      });
    }

    return res.status(200).json({
      patient,
      risk,
      alert,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Telemetry update failed",
    });
  }
});

module.exports = router;
