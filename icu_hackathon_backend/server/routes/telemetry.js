const express = require("express");
const { analyzeRisk } = require("../services/riskAnalyzer");
const { resolveTelemetryPayload, validateResolvedVitals } = require("../services/telemetryDecoder");
const { resolveIdentity } = require("../services/identityResolver");
const { predictRiskNextFiveMinutes } = require("../services/forecastService");
const Patient = require("../models/Patient");
const { logTelemetryEvent, logAlertEvent } = require("../models/EventLog");
const { announceCriticalAlert } = require("../services/alertSpeaker");

const router = express.Router();

router.post("/update", async (req, res) => {
  try {
    const telemetry = resolveTelemetryPayload(req.body || {});
    const { valid, missing } = validateResolvedVitals(telemetry);

    if (!valid) {
      return res.status(400).json({
        error:
          "Telemetry payload is missing decodable vitals. Provide structured vitals or a valid hexadecimal telemetry payload.",
        missing,
        decoderWarnings: telemetry.decoderWarnings,
      });
    }

    const { heartRate, spo2, temperature, bloodPressure } = telemetry;
    const identity = resolveIdentity({
      patientId: telemetry.patientId,
      monitorId: telemetry.monitorId,
      source: telemetry.sourceHint,
      bedId: telemetry.bedId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
    });
    const patientId = identity.patientId;

    const forecast = await predictRiskNextFiveMinutes({
      heartRate,
      spo2,
      temperature,
      bloodPressure,
    });

    const risk = analyzeRisk({ patientId, heartRate, spo2, temperature, bloodPressure });
    const patient = await Patient.upsertPatient({
      patientId,
      heartRate,
      spo2,
      temperature,
      bloodPressure,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      predictedRiskNext5Minutes: forecast.predictedRiskLevel,
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
      decodedVitals: {
        heartRate,
        spo2,
        temperature,
        bloodPressure,
        monitorId: telemetry.monitorId || identity.monitorKey,
        source: telemetry.source,
      },
      decoderWarnings: telemetry.decoderWarnings,
      identityResolution: identity,
      forecast: {
        predictedRiskNext5Minutes: forecast.predictedRiskLevel,
        source: forecast.source,
        forecastedVitals: forecast.forecastedVitals,
        warning: forecast.warning,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Telemetry update failed",
    });
  }
});

module.exports = router;
