const { getSupabaseClient, isSupabaseConfigured } = require("../services/supabaseClient");

const TABLES = {
  telemetry: "telemetry_events",
  voice: "voice_interactions",
  alerts: "alert_events",
};

function normalizeLimit(limit, fallback = 60) {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(200, Math.trunc(parsed)));
}

function shouldIgnoreEventError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

async function safeInsert(table, payload) {
  if (!isSupabaseConfigured()) {
    return;
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from(table).insert(payload);
    if (error && !shouldIgnoreEventError(error)) {
      throw new Error(error.message);
    }
  } catch (error) {
    if (!shouldIgnoreEventError(error)) {
      throw error;
    }
  }
}

function mapTelemetryRow(row) {
  return {
    id: `telemetry-${row.id}`,
    eventType: "telemetry",
    patientId: row.patient_id,
    occurredAt: row.received_at,
    riskLevel: row.risk_level,
    reason: row.reason,
    telemetry: {
      heartRate: row.heart_rate,
      spo2: row.spo2,
      temperature: row.temperature,
      bloodPressure: row.blood_pressure,
    },
  };
}

function mapAlertRow(row) {
  return {
    id: `alert-${row.id}`,
    eventType: "alert",
    patientId: row.patient_id,
    occurredAt: row.created_at,
    alertType: row.alert_type,
    language: row.language,
    message: row.message,
    delivered: Boolean(row.delivered),
    deliveryReason: row.delivery_reason,
  };
}

async function listTimeline({ patientId, limit }) {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const safeLimit = normalizeLimit(limit);
  const supabase = getSupabaseClient();
  const patientFilter = patientId ? String(patientId) : null;

  let telemetryQuery = supabase
    .from(TABLES.telemetry)
    .select("id, patient_id, heart_rate, spo2, temperature, blood_pressure, risk_level, reason, received_at")
    .order("received_at", { ascending: false })
    .limit(safeLimit);

  let alertQuery = supabase
    .from(TABLES.alerts)
    .select("id, patient_id, alert_type, language, message, delivered, delivery_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (patientFilter) {
    telemetryQuery = telemetryQuery.eq("patient_id", patientFilter);
    alertQuery = alertQuery.eq("patient_id", patientFilter);
  }

  const [{ data: telemetryData, error: telemetryError }, { data: alertData, error: alertError }] =
    await Promise.all([telemetryQuery, alertQuery]);

  if (telemetryError && !shouldIgnoreEventError(telemetryError)) {
    throw new Error(`Supabase telemetry timeline failed: ${telemetryError.message}`);
  }

  if (alertError && !shouldIgnoreEventError(alertError)) {
    throw new Error(`Supabase alert timeline failed: ${alertError.message}`);
  }

  const events = [
    ...((telemetryData || []).map(mapTelemetryRow)),
    ...((alertData || []).map(mapAlertRow)),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return events.slice(0, safeLimit);
}

async function logTelemetryEvent({
  patientId,
  heartRate,
  spo2,
  temperature,
  bloodPressure,
  riskLevel,
  reason,
}) {
  await safeInsert(TABLES.telemetry, {
    patient_id: String(patientId),
    heart_rate: Number(heartRate),
    spo2: Number(spo2),
    temperature: Number(temperature),
    blood_pressure: bloodPressure ? String(bloodPressure) : "",
    risk_level: String(riskLevel || "STABLE"),
    reason: reason ? String(reason) : null,
  });
}

async function logVoiceInteraction({
  transcript,
  intent,
  patientId,
  language,
  responseText,
  source,
}) {
  await safeInsert(TABLES.voice, {
    transcript: String(transcript || ""),
    intent: String(intent || "ICU_SUMMARY"),
    patient_id: patientId ? String(patientId) : null,
    language: String(language || "en"),
    response_text: String(responseText || ""),
    source: String(source || "text"),
  });
}

async function logAlertEvent({
  patientId,
  alertType,
  language,
  message,
  delivered,
  deliveryReason,
}) {
  await safeInsert(TABLES.alerts, {
    patient_id: String(patientId),
    alert_type: String(alertType || "critical-alert"),
    language: String(language || "en"),
    message: String(message || ""),
    delivered: Boolean(delivered),
    delivery_reason: deliveryReason ? String(deliveryReason) : null,
  });
}

module.exports = {
  logTelemetryEvent,
  logVoiceInteraction,
  logAlertEvent,
  listTimeline,
};
