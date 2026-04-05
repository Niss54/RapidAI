const { getSupabaseClient, isSupabaseConfigured } = require("../services/supabaseClient");
const { computeRiskAssessment } = require("../services/riskAnalyzer");
const { heuristicForecastLevel } = require("../services/forecastService");

const TABLE = "patients";
const inMemoryPatients = new Map();

function listInMemoryPatients() {
  return Array.from(inMemoryPatients.values()).sort(
    (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );
}

function shouldFallbackToMemory(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

function shouldRetryWithoutOptionalColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    (message.includes("risk_score") || message.includes("predicted_risk_level")) &&
    (message.includes("column") || message.includes("schema cache"))
  );
}

function toClampedRiskScore(value, fallbackValue = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.min(100, Math.round(Number(fallbackValue) || 0)));
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizePredictedRiskLevel(value, fallbackLevel) {
  const normalized = String(value || fallbackLevel || "WARNING").trim().toUpperCase();
  if (["CRITICAL", "MODERATE", "WARNING", "STABLE"].includes(normalized)) {
    return normalized;
  }

  return "WARNING";
}

function toApiModel(row) {
  if (!row) {
    return null;
  }

  const heartRate = row.heartRate ?? row.heart_rate;
  const spo2 = row.spo2;
  const temperature = row.temperature;
  const bloodPressure = row.bloodPressure || row.blood_pressure;
  const assessment = computeRiskAssessment({ heartRate, spo2, temperature, bloodPressure });
  const riskScore = toClampedRiskScore(row.riskScore ?? row.risk_score, assessment.riskScore);
  const predictedFallback = heuristicForecastLevel({ heartRate, spo2, temperature, bloodPressure });
  const predictedRiskNext5Minutes = normalizePredictedRiskLevel(
    row.predictedRiskNext5Minutes ?? row.predicted_risk_level,
    predictedFallback
  );

  return {
    patientId: row.patientId || row.patient_id,
    heartRate,
    spo2,
    temperature,
    bloodPressure,
    riskScore,
    riskLevel: row.riskLevel || row.risk_level || assessment.riskLevel,
    predictedRiskNext5Minutes,
    lastUpdated: row.lastUpdated || row.last_updated,
  };
}

async function upsertPatient(patient) {
  const assessment = computeRiskAssessment({
    heartRate: patient.heartRate,
    spo2: patient.spo2,
    temperature: patient.temperature,
    bloodPressure: patient.bloodPressure,
  });

  const payload = {
    patientId: String(patient.patientId),
    heart_rate: Number(patient.heartRate),
    spo2: Number(patient.spo2),
    temperature: Number(patient.temperature),
    blood_pressure: String(patient.bloodPressure || ""),
    risk_score: toClampedRiskScore(patient.riskScore, assessment.riskScore),
    risk_level: String(patient.riskLevel || assessment.riskLevel || "STABLE"),
    predicted_risk_level: normalizePredictedRiskLevel(
      patient.predictedRiskNext5Minutes,
      heuristicForecastLevel(patient)
    ),
    last_updated: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const apiModel = toApiModel(payload);
    inMemoryPatients.set(apiModel.patientId, apiModel);
    return apiModel;
  }

  const supabase = getSupabaseClient();

  const upsertWithRiskScore = {
    patient_id: payload.patientId,
    heart_rate: payload.heart_rate,
    spo2: payload.spo2,
    temperature: payload.temperature,
    blood_pressure: payload.blood_pressure,
    risk_score: payload.risk_score,
    risk_level: payload.risk_level,
    predicted_risk_level: payload.predicted_risk_level,
    last_updated: payload.last_updated,
  };

  const upsertWithoutPrediction = {
    patient_id: payload.patientId,
    heart_rate: payload.heart_rate,
    spo2: payload.spo2,
    temperature: payload.temperature,
    blood_pressure: payload.blood_pressure,
    risk_score: payload.risk_score,
    risk_level: payload.risk_level,
    last_updated: payload.last_updated,
  };

  const upsertWithoutRiskScore = {
    patient_id: payload.patientId,
    heart_rate: payload.heart_rate,
    spo2: payload.spo2,
    temperature: payload.temperature,
    blood_pressure: payload.blood_pressure,
    risk_level: payload.risk_level,
    last_updated: payload.last_updated,
  };

  let result = await supabase
    .from(TABLE)
    .upsert(upsertWithRiskScore, { onConflict: "patient_id" })
    .select()
    .single();

  if (result.error && shouldRetryWithoutOptionalColumns(result.error)) {
    result = await supabase
      .from(TABLE)
      .upsert(upsertWithoutPrediction, { onConflict: "patient_id" })
      .select()
      .single();
  }

  if (result.error && shouldRetryWithoutOptionalColumns(result.error)) {
    result = await supabase
      .from(TABLE)
      .upsert(upsertWithoutRiskScore, { onConflict: "patient_id" })
      .select()
      .single();
  }

  const { data, error } = result;

  if (error) {
    if (shouldFallbackToMemory(error)) {
      const apiModel = toApiModel(payload);
      inMemoryPatients.set(apiModel.patientId, apiModel);
      return apiModel;
    }
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  return toApiModel(data);
}

async function getPatientById(patientId) {
  if (!isSupabaseConfigured()) {
    return inMemoryPatients.get(String(patientId)) || null;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("patient_id", patientId)
    .maybeSingle();

  if (error) {
    if (shouldFallbackToMemory(error)) {
      return inMemoryPatients.get(String(patientId)) || null;
    }
    throw new Error(`Supabase get patient failed: ${error.message}`);
  }

  return toApiModel(data);
}

async function listPatients() {
  if (!isSupabaseConfigured()) {
    return listInMemoryPatients();
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("last_updated", { ascending: false });

  if (error) {
    if (shouldFallbackToMemory(error)) {
      return listInMemoryPatients();
    }
    throw new Error(`Supabase list patients failed: ${error.message}`);
  }

  return (data || []).map(toApiModel);
}

async function summarizePatients() {
  const patients = await listPatients();
  const summary = {
    critical: 0,
    moderate: 0,
    warning: 0,
    stable: 0,
    total: patients.length,
  };

  for (const patient of patients) {
    const risk = String(patient.riskLevel || "STABLE").toUpperCase();
    if (risk === "CRITICAL") {
      summary.critical += 1;
    } else if (risk === "MODERATE") {
      summary.moderate += 1;
    } else if (risk === "WARNING") {
      summary.warning += 1;
    } else {
      summary.stable += 1;
    }
  }

  return { summary, patients };
}

module.exports = {
  upsertPatient,
  getPatientById,
  listPatients,
  summarizePatients,
};
