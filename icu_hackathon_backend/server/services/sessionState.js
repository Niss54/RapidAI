const SUPPORTED_LANGUAGES = ["en", "hi", "bn", "ta", "te", "mr", "gu", "kn", "ml", "pa", "ur", "or"];

let activeLanguage = "en";
let introSpokenBySession = new Set();
let activeAlert = {
  isActive: false,
  patientId: null,
  message: null,
  language: "en",
  untilMs: 0,
};

function normalizeSessionKey(sessionId) {
  const normalized = String(sessionId || "global").trim();
  return normalized.length > 0 ? normalized : "global";
}

function normalizeLanguage(language) {
  const normalized = String(language || "en").trim().toLowerCase();

  if (SUPPORTED_LANGUAGES.includes(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("hi")) {
    return "hi";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }

  return "en";
}

function getLanguage() {
  return activeLanguage;
}

function setLanguage(language) {
  activeLanguage = normalizeLanguage(language);
  return activeLanguage;
}

function getSupportedLanguages() {
  return [...SUPPORTED_LANGUAGES];
}

function getSarvamLanguageCandidates(language) {
  const normalized = normalizeLanguage(language);
  const candidates = [normalized];

  if (normalized !== "en") {
    candidates.push("en");
  }

  if (normalized !== "hi") {
    candidates.push("hi");
  }

  return Array.from(new Set(candidates));
}

function shouldSpeakIntroduction(sessionId) {
  const key = normalizeSessionKey(sessionId);

  if (introSpokenBySession.has(key)) {
    return false;
  }

  introSpokenBySession.add(key);

  // Keep session cache bounded for long-running processes.
  if (introSpokenBySession.size > 1000) {
    const oldestKey = introSpokenBySession.values().next().value;
    if (oldestKey) {
      introSpokenBySession.delete(oldestKey);
    }
  }

  return true;
}

function resetIntroduction(sessionId) {
  if (!sessionId) {
    introSpokenBySession = new Set();
    return;
  }

  introSpokenBySession.delete(normalizeSessionKey(sessionId));
}

function activateAlertMode({ patientId, message, language, durationMs = 18000 }) {
  activeAlert = {
    isActive: true,
    patientId: patientId ? String(patientId) : null,
    message: message ? String(message) : null,
    language: normalizeLanguage(language || getLanguage()),
    untilMs: Date.now() + Math.max(3000, Number(durationMs) || 18000),
  };

  return getAlertMode();
}

function clearAlertMode() {
  activeAlert = {
    isActive: false,
    patientId: null,
    message: null,
    language: activeLanguage,
    untilMs: 0,
  };
}

function getAlertMode() {
  if (!activeAlert.isActive) {
    return { active: false };
  }

  if (Date.now() > activeAlert.untilMs) {
    clearAlertMode();
    return { active: false };
  }

  return {
    active: true,
    patientId: activeAlert.patientId,
    message: activeAlert.message,
    language: activeAlert.language,
    remainingMs: Math.max(0, activeAlert.untilMs - Date.now()),
  };
}

module.exports = {
  getLanguage,
  setLanguage,
  normalizeLanguage,
  getSupportedLanguages,
  getSarvamLanguageCandidates,
  shouldSpeakIntroduction,
  resetIntroduction,
  activateAlertMode,
  clearAlertMode,
  getAlertMode,
};
