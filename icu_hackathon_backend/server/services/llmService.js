const Groq = require("groq-sdk");

const INTENT_SCHEMA = {
  intent: "PATIENT_STATUS | ICU_SUMMARY | LANGUAGE_SWITCH",
  patientId: "string | null",
  language: "en | hi | null",
};

function detectIntentHeuristic(commandText) {
  const text = String(commandText || "").toLowerCase();
  const wantsLanguageSwitch =
    /switch|change|language|speak|speak in/.test(text) || /भाषा|बदल/.test(text);

  if (wantsLanguageSwitch && (/\bhindi\b/.test(text) || /\bhi\b/.test(text) || /हिंदी/.test(text))) {
    return { intent: "LANGUAGE_SWITCH", patientId: null, language: "hi" };
  }

  if (wantsLanguageSwitch && (/\benglish\b/.test(text) || /\ben\b/.test(text) || /अंग्रेजी/.test(text))) {
    return { intent: "LANGUAGE_SWITCH", patientId: null, language: "en" };
  }

  const patientMatch = text.match(/patient\s*([a-z0-9_-]+)/i);
  if (patientMatch && (text.includes("status") || text.includes("condition") || text.includes("risk"))) {
    return {
      intent: "PATIENT_STATUS",
      patientId: patientMatch[1],
      language: null,
    };
  }

  if (text.includes("summary") || text.includes("brief") || text.includes("overall")) {
    return { intent: "ICU_SUMMARY", patientId: null, language: null };
  }

  return { intent: "ICU_SUMMARY", patientId: null, language: null };
}

async function detectIntent(commandText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return detectIntentHeuristic(commandText);
  }

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const groq = new Groq({ apiKey });

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Detect ICU command intent and return strict JSON with fields intent, patientId, language. Use only intents PATIENT_STATUS, ICU_SUMMARY, LANGUAGE_SWITCH.",
        },
        {
          role: "user",
          content: `Command: ${commandText}\nSchema: ${JSON.stringify(INTENT_SCHEMA)}`,
        },
      ],
    });
  } catch {
    return detectIntentHeuristic(commandText);
  }

  const raw = completion.choices?.[0]?.message?.content || "{}";
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { intent: "ICU_SUMMARY", patientId: null, language: null };
  }

  const intent = ["PATIENT_STATUS", "ICU_SUMMARY", "LANGUAGE_SWITCH"].includes(parsed.intent)
    ? parsed.intent
    : "ICU_SUMMARY";

  const language = parsed.language === "hi" ? "hi" : parsed.language === "en" ? "en" : null;

  return {
    intent,
    patientId: parsed.patientId ? String(parsed.patientId) : null,
    language,
  };
}

module.exports = {
  detectIntent,
};
