const axios = require("axios");
const FormData = require("form-data");

async function transcribeAudio(audioBuffer, language = "en") {
  const apiKey = process.env.SARVAM_API_KEY;
  if (!apiKey) {
    throw new Error("SARVAM_API_KEY is required for STT");
  }

  const endpoint = process.env.SARVAM_STT_URL || "https://api.sarvam.ai/speech-to-text";
  const lang = language === "hi" ? "hi" : "en";

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
}

module.exports = {
  transcribeAudio,
};
