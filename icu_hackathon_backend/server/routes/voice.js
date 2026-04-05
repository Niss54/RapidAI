const express = require("express");
const { createVoiceToken } = require("../services/livekitService");
const { processVoiceQuery } = require("../services/voiceController");

const router = express.Router();

router.get("/token", async (_req, res) => {
  try {
    const tokenInfo = await createVoiceToken();
    return res.status(200).json(tokenInfo);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Could not create LiveKit token",
    });
  }
});

router.post("/query", async (req, res) => {
  try {
    const { text, audioBase64, language } = req.body || {};

    if (!text && !audioBase64) {
      return res.status(400).json({ error: "text or audioBase64 is required" });
    }

    const audioBuffer = audioBase64 ? Buffer.from(audioBase64, "base64") : null;

    const result = await processVoiceQuery({
      text,
      audioBuffer,
      language,
    });

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Voice query failed",
    });
  }
});

module.exports = router;
