function analyzeRisk({ patientId, heartRate, spo2, temperature }) {
  const hr = Number(heartRate);
  const oxy = Number(spo2);
  const temp = Number(temperature);

  if (Number.isFinite(oxy) && oxy < 85) {
    return {
      patientId,
      riskLevel: "CRITICAL",
      reason: "SpO2 dropped below 85",
    };
  }

  if (Number.isFinite(hr) && hr > 120) {
    return {
      patientId,
      riskLevel: "MODERATE",
      reason: "Heart rate exceeded 120",
    };
  }

  if (Number.isFinite(temp) && temp > 101) {
    return {
      patientId,
      riskLevel: "WARNING",
      reason: "Temperature exceeded 101",
    };
  }

  return {
    patientId,
    riskLevel: "STABLE",
    reason: "Vitals are within acceptable range",
  };
}

module.exports = {
  analyzeRisk,
};
