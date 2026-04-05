function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBloodPressure(bloodPressure) {
  const raw = String(bloodPressure || "").trim();
  if (!raw) {
    return { systolic: null, diastolic: null };
  }

  const match = raw.match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) {
    return { systolic: null, diastolic: null };
  }

  return {
    systolic: toFiniteNumber(match[1]),
    diastolic: toFiniteNumber(match[2]),
  };
}

function clampScore(score) {
  const normalized = Number.isFinite(score) ? score : 0;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function scoreFromSpo2(oxygen) {
  if (oxygen === null) {
    return 0;
  }
  if (oxygen < 85) {
    return 70;
  }
  if (oxygen <= 89) {
    return 45;
  }
  if (oxygen <= 92) {
    return 25;
  }
  if (oxygen <= 95) {
    return 10;
  }
  return 0;
}

function scoreFromHeartRate(heartRate) {
  if (heartRate === null) {
    return 0;
  }
  if (heartRate < 45 || heartRate > 120) {
    return 35;
  }
  if ((heartRate >= 45 && heartRate <= 49) || (heartRate >= 111 && heartRate <= 120)) {
    return 20;
  }
  if ((heartRate >= 50 && heartRate <= 59) || (heartRate >= 101 && heartRate <= 110)) {
    return 10;
  }
  return 0;
}

function scoreFromTemperature(temperature) {
  if (temperature === null) {
    return 0;
  }
  if (temperature < 35.0 || temperature > 39.5) {
    return 30;
  }
  if ((temperature >= 35.0 && temperature <= 35.4) || (temperature >= 38.6 && temperature <= 39.5)) {
    return 18;
  }
  if ((temperature >= 35.5 && temperature <= 35.9) || (temperature >= 37.6 && temperature <= 38.5)) {
    return 8;
  }
  return 0;
}

function scoreFromBloodPressure(systolic, diastolic) {
  if (systolic === null || diastolic === null) {
    return 0;
  }

  if (systolic < 90 || systolic > 180 || diastolic < 55 || diastolic > 110) {
    return 25;
  }

  if (systolic < 100 || systolic > 160 || diastolic < 60 || diastolic > 100) {
    return 12;
  }

  return 0;
}

function deriveRiskLevelFromScore(score) {
  if (score >= 75) {
    return "CRITICAL";
  }
  if (score >= 50) {
    return "MODERATE";
  }
  if (score >= 25) {
    return "WARNING";
  }
  return "STABLE";
}

function deriveReason({ score, oxygen, heartRate, temperature, systolic }) {
  if (oxygen !== null && oxygen < 85) {
    return "Severe oxygen desaturation detected";
  }

  if (heartRate !== null && heartRate > 120) {
    return "Tachycardia and instability indicators detected";
  }

  if (temperature !== null && temperature > 39.0) {
    return "High fever trend detected";
  }

  if (systolic !== null && systolic < 90) {
    return "Low blood pressure trend detected";
  }

  if (score >= 75) {
    return "Multiple vital signs indicate severe instability";
  }
  if (score >= 50) {
    return "Patient vitals indicate elevated risk";
  }
  if (score >= 25) {
    return "Patient vitals require close monitoring";
  }

  return "Vitals are within acceptable range";
}

function computeRiskAssessment({ heartRate, spo2, temperature, bloodPressure }) {
  const hr = toFiniteNumber(heartRate);
  const oxygen = toFiniteNumber(spo2);
  const temp = toFiniteNumber(temperature);
  const { systolic, diastolic } = parseBloodPressure(bloodPressure);

  let score = 0;
  score += scoreFromSpo2(oxygen);
  score += scoreFromHeartRate(hr);
  score += scoreFromTemperature(temp);
  score += scoreFromBloodPressure(systolic, diastolic);

  // Combination penalties catch high-risk multi-signal deterioration patterns.
  if (oxygen !== null && oxygen < 90 && hr !== null && hr > 120) {
    score += 10;
  }

  if (temp !== null && temp > 38.5 && hr !== null && hr > 110) {
    score += 8;
  }

  if (systolic !== null && systolic < 90 && oxygen !== null && oxygen < 92) {
    score += 10;
  }

  const riskScore = clampScore(score);
  const riskLevel = deriveRiskLevelFromScore(riskScore);
  const reason = deriveReason({
    score: riskScore,
    oxygen,
    heartRate: hr,
    temperature: temp,
    systolic,
  });

  return {
    riskScore,
    riskLevel,
    reason,
  };
}

function analyzeRisk({ patientId, heartRate, spo2, temperature, bloodPressure }) {
  const assessment = computeRiskAssessment({ heartRate, spo2, temperature, bloodPressure });

  return {
    patientId,
    riskScore: assessment.riskScore,
    riskLevel: assessment.riskLevel,
    reason: assessment.reason,
  };
}

module.exports = {
  analyzeRisk,
  computeRiskAssessment,
};
