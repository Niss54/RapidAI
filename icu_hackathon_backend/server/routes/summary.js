const express = require("express");
const Patient = require("../models/Patient");
const EventLog = require("../models/EventLog");

const router = express.Router();

router.get("/summary", async (_req, res) => {
  try {
    const { summary, patients } = await Patient.summarizePatients();
    return res.status(200).json({ summary, patients });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not fetch ICU summary",
    });
  }
});

router.get("/timeline", async (req, res) => {
  try {
    const patientId = req.query?.patientId ? String(req.query.patientId) : null;
    const limit = req.query?.limit ? Number(req.query.limit) : undefined;
    const events = await EventLog.listTimeline({ patientId, limit });

    return res.status(200).json({
      events,
      total: events.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not fetch ICU timeline",
    });
  }
});

module.exports = router;
