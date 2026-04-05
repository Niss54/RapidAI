const { getSupabaseClient, isSupabaseConfigured } = require("../services/supabaseClient");

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

function toApiModel(row) {
  if (!row) {
    return null;
  }

  return {
    patientId: row.patientId || row.patient_id,
    heartRate: row.heartRate ?? row.heart_rate,
    spo2: row.spo2,
    temperature: row.temperature,
    bloodPressure: row.bloodPressure || row.blood_pressure,
    riskLevel: row.riskLevel || row.risk_level,
    lastUpdated: row.lastUpdated || row.last_updated,
  };
}

async function upsertPatient(patient) {
  const payload = {
    patientId: String(patient.patientId),
    heart_rate: Number(patient.heartRate),
    spo2: Number(patient.spo2),
    temperature: Number(patient.temperature),
    blood_pressure: String(patient.bloodPressure || ""),
    risk_level: String(patient.riskLevel || "STABLE"),
    last_updated: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    const apiModel = toApiModel(payload);
    inMemoryPatients.set(apiModel.patientId, apiModel);
    return apiModel;
  }

  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        patient_id: payload.patientId,
        heart_rate: payload.heart_rate,
        spo2: payload.spo2,
        temperature: payload.temperature,
        blood_pressure: payload.blood_pressure,
        risk_level: payload.risk_level,
        last_updated: payload.last_updated,
      },
      { onConflict: "patient_id" }
    )
    .select()
    .single();

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
