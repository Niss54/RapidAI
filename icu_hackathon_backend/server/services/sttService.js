const axios = require("axios");
const FormData = require("form-data");
const { getSarvamLanguageCandidates } = require("./sessionState");

async function transcribeAudio(audioBuffer, language = "en") {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is required for STT");
  }

  const endpoint = process.env.SARVAM_STT_URL || "https://api.sarvam.ai/speech-to-text";
  const candidates = getSarvamLanguageCandidates(language);
  let lastError = null;

  for (const lang of candidates) {
    try {
      const form = new FormData();
      form.append("file", audioBuffer, {
        filename: "doctor-query.webm",
        contentType: "audio/webm",
      });
      form.append("language", lang);

      const { data } = await axios.post(endpoint, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        maxBodyLength: Infinity,
      });

      return data?.text || data?.transcript || "";
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("STT request failed for all language fallbacks");
}

module.exports = {
  transcribeAudio,
};
