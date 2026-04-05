const axios = require("axios");
const { getSarvamLanguageCandidates } = require("./sessionState");

async function synthesizeSpeech(text, language = "en") {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    return Buffer.alloc(0);
  }

  const endpoint = process.env.SARVAM_TTS_URL || "https://api.sarvam.ai/text-to-speech";
  const candidates = getSarvamLanguageCandidates(language);
  let lastError = null;

  for (const lang of candidates) {
    try {
      const { data } = await axios.post(
        endpoint,
        {
          text,
          language: lang,
          voice: process.env.SARVAM_VOICE || "anushka",
          format: "mp3",
        },
        {
          responseType: "arraybuffer",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      return Buffer.from(data);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("TTS request failed for all language fallbacks");
}

module.exports = {
  synthesizeSpeech,
};
