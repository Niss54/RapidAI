let activeLanguage = "en";

function getLanguage() {
  return activeLanguage;
}

function setLanguage(language) {
  const normalized = String(language || "en").toLowerCase();
  activeLanguage = normalized === "hi" ? "hi" : "en";
  return activeLanguage;
}

module.exports = {
  getLanguage,
  setLanguage,
};
