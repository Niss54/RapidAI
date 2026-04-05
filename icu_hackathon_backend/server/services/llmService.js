const Groq = require("groq-sdk");
const { normalizeLanguage, getSupportedLanguages } = require("./sessionState");

const SUPPORTED_LANGUAGES = getSupportedLanguages();

const INTENT_SCHEMA = {
  intent: "PATIENT_STATUS | ICU_SUMMARY | LANGUAGE_SWITCH",
  patientId: "string | null",
  language: `${SUPPORTED_LANGUAGES.join(" | ")} | null`,
};

const LANGUAGE_KEYWORDS = {
  en: ["english", "angrezi", "अंग्रेजी"],
  hi: ["hindi", "हिंदी", "हिन्दी"],
  bn: ["bengali", "bangla", "বাংলা"],
  ta: ["tamil", "தமிழ்"],
  te: ["telugu", "తెలుగు"],
  mr: ["marathi", "मराठी"],
  gu: ["gujarati", "ગુજરાતી"],
  kn: ["kannada", "ಕನ್ನಡ"],
  ml: ["malayalam", "മലയാളം"],
  pa: ["punjabi", "ਪੰਜਾਬੀ"],
  ur: ["urdu", "اردو"],
  or: ["odia", "oriya", "ଓଡ଼ିଆ"],
};

function detectLanguageFromText(text) {
  for (const [code, keywords] of Object.entries(LANGUAGE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return code;
    }
  }

  return null;
}

function detectIntentHeuristic(commandText) {
  const text = String(commandText || "").toLowerCase();
  const wantsLanguageSwitch =
    /switch|change|language|speak|speak in|talk in|respond in|translate/.test(text) ||
    /भाषा|बदल|bol|bolo/.test(text);

  const requestedLanguage = detectLanguageFromText(text);

  if (wantsLanguageSwitch && requestedLanguage) {
    return {
      intent: "LANGUAGE_SWITCH",
      patientId: null,
      language: normalizeLanguage(requestedLanguage),
    };
  }

  const patientMatch = text.match(/(?:patient|pt|mrn|मरीज|रोगी)\s*([a-z0-9_-]+)/i);
  const asksPatientDetails =
    /status|condition|risk|detail|details|summary|report|oxygen|spo2|heart|bp|temperature|vitals|रिपोर्ट|स्थिति|हाल/.test(
      text
    );

  if (asksPatientDetails) {
    return {
      intent: "PATIENT_STATUS",
      patientId: patientMatch ? String(patientMatch[1]) : null,
      language: null,
    };
  }

  if (/icu|ward|overall|all patients|all patient|brief/.test(text)) {
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
            `Detect ICU command intent and return strict JSON with fields intent, patientId, language. Use only intents PATIENT_STATUS, ICU_SUMMARY, LANGUAGE_SWITCH. Supported language codes: ${SUPPORTED_LANGUAGES.join(
              ", "
            )}. For patient detail query without explicit patient id, set patientId as null.`,
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

  const language = parsed.language ? normalizeLanguage(parsed.language) : null;

  return {
    intent,
    patientId: parsed.patientId ? String(parsed.patientId) : null,
    language: language && SUPPORTED_LANGUAGES.includes(language) ? language : null,
  };
}

module.exports = {
  detectIntent,
};
