export type PatientRecord = {
  patientId: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
  riskScore: number;
  riskLevel: string;
  predictedRiskNext5Minutes: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
  lastUpdated: string;
};

export type IcuSummaryResponse = {
  summary: {
    critical: number;
    moderate: number;
    warning: number;
    stable: number;
    total: number;
  };
  patients: PatientRecord[];
};

export type TimelineEvent = {
  id: string;
  eventType: "telemetry" | "alert";
  patientId: string;
  occurredAt: string;
  riskLevel?: string;
  reason?: string | null;
  telemetry?: {
    heartRate: number | null;
    spo2: number | null;
    temperature: number | null;
    bloodPressure: string | null;
  };
  alertType?: string;
  language?: "en" | "hi" | string;
  message?: string;
  delivered?: boolean;
  deliveryReason?: string | null;
};

export type TimelineResponse = {
  events: TimelineEvent[];
  total: number;
};

export type ForecastProjectionPoint = {
  minute: number;
  riskScore: number;
};

export type ForecastProjectionFilters = {
  patientId?: string;
  patientIds?: string[];
  from?: string;
  to?: string;
};

export type ForecastSourceSummary = {
  legacyMl: number;
  heuristicFallback: number;
  disabled: number;
};

export type ForecastProjectionRecord = {
  patientId: string;
  patientLastUpdated: string | null;
  currentRiskScore: number;
  futureRiskScore: number;
  predictedDeteriorationState: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
  source: "legacy-ml" | "heuristic-fallback" | "disabled";
  warning: string | null;
  forecastedVitals: number[] | null;
  timelineProjection: ForecastProjectionPoint[];
};

export type ForecastProjectionResponse = {
  generatedAt: string;
  total: number;
  appliedFilters: {
    patientIds: string[];
    from: string | null;
    to: string | null;
  };
  sourceSummary: ForecastSourceSummary;
  projections: ForecastProjectionRecord[];
};

export type LiveKitTokenResponse = {
  token: string;
  roomName: string;
  identity: string;
  wsUrl: string;
};

export type VoiceLanguage =
  | "en"
  | "hi"
  | "bn"
  | "ta"
  | "te"
  | "mr"
  | "gu"
  | "kn"
  | "ml"
  | "pa"
  | "ur"
  | "or";

export type VoiceQueryResponse = {
  transcript: string;
  intent: "PATIENT_STATUS" | "ICU_SUMMARY" | "LANGUAGE_SWITCH" | "GENERAL_QUERY" | "ALERT_LOCK";
  patientId: string | null;
  language: VoiceLanguage;
  responseText: string;
  audioBase64: string | null;
};

export type VoiceLanguagesResponse = {
  activeLanguage: VoiceLanguage;
  supportedLanguages: VoiceLanguage[];
};

export type VoiceAlertStateResponse =
  | {
      active: false;
    }
  | {
      active: true;
      patientId: string | null;
      message: string | null;
      language: VoiceLanguage;
      remainingMs: number;
    };

export type TelemetryUpdateResponse = {
  patient: PatientRecord;
  risk: {
    patientId: string;
    riskScore: number;
    riskLevel: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
    reason: string;
  };
  decodedVitals?: {
    heartRate: number;
    spo2: number;
    temperature: number;
    bloodPressure: string;
    monitorId?: string;
    source: "hex" | "json";
  };
  decoderWarnings?: string[];
  identityResolution?: {
    patientId: string;
    monitorKey: string;
    providedPatientId: string | null;
    resolution: "direct-bind" | "anonymous-bind" | "monitor-binding" | "collision-fallback" | "pattern-fallback";
    collision: boolean;
    notes: string[];
  };
  forecast?: {
    predictedRiskNext5Minutes: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
    source: "legacy-ml" | "heuristic-fallback" | "disabled";
    forecastedVitals: number[] | null;
    warning: string | null;
  };
  alert: {
    text: string;
    language: "en" | "hi";
    audioBase64: string | null;
    delivered: boolean;
    deliveryReason: string | null;
  } | null;
};

export type TelemetryIngestResponse = {
  heartRate?: number;
  heart_rate?: number;
  hr?: number;
  spo2?: number;
  temperature?: number;
  bloodPressure?: string;
  blood_pressure?: string;
  bp?: string;
  packet_integrity_status?: string;
  packetIntegrityStatus?: string;
  reconstruction_status?: string;
  reconstructionStatus?: string;
  observations_ingested?: number;
  observationsIngested?: number;
  warnings?: string[];
  message?: string;
  latest_vitals?: Record<string, unknown>;
};

export type AnalyticsPatientState = {
  patient_id: string;
  monitor_id?: string;
  resolution_strategy?: string;
  timestamp?: number | null;
  risk_score?: number;
  risk_level?: string;
  last_source?: string;
  updated_at?: number | null;
  latest_vitals?: Record<string, unknown>;
};

export type AnalyticsPatientsResponse = {
  patients: AnalyticsPatientState[];
};

export type AnalyticsPatientDetail = {
  patient_id: string;
  latest_vitals: Record<string, unknown>;
  signal_history?: Record<string, Array<{ value: number; timestamp: number }>>;
  alerts?: Array<Record<string, unknown>>;
  conflicts?: Array<Record<string, unknown>>;
  risk_score?: number;
  risk_level?: string;
  last_source?: string;
  updated_at?: number | null;
};

export type AnalyticsAlertRecord = {
  patient_id?: string;
  severity?: string;
  reason?: string;
  alert_reason?: string;
  timestamp?: number;
  risk_score?: number;
  signal?: string;
  value?: number;
  duplicate_suppressed?: boolean | string | number;
  duplicateSuppressed?: boolean | string | number;
  cooldown_remaining_seconds?: number | string;
  cooldownRemainingSeconds?: number | string;
};

export type AnalyticsAlertsResponse = {
  alerts: AnalyticsAlertRecord[];
  count: number;
};

export type TriageInsight = {
  available?: boolean;
  severity?: "negligible" | "moderate" | "high" | "urgent" | string;
  assessment?: string;
  value?: number;
};

export type TriageAnalysisResponse = {
  patient_id?: string;
  overall_severity?: "negligible" | "moderate" | "high" | "urgent" | string;
  triage_priority?: string;
  recommended_escalation?: string;
  risk_explanation_summary?: string;
  insights?: {
    shock_index?: TriageInsight;
    map?: TriageInsight;
    sepsis_warning?: TriageInsight;
    cushings_warning?: TriageInsight;
    [key: string]: TriageInsight | undefined;
  };
};

export type ForecastNextResponse = {
  forecasted_vitals: number[];
  status: string;
};

export type VoiceLogRecord = {
  id: string;
  patient_id?: string | null;
  query_text: string;
  detected_intent: string;
  language: string;
  response_summary: string;
  timestamp: string;
};

export type VoiceLogsResponse = {
  logs: VoiceLogRecord[];
  total: number;
  page: number;
  limit: number;
};

export type SimulatorControlResponse = {
  running: boolean;
  status: "Running" | "Stopped";
  intervalMs: number;
  targetUrl: string;
  lastError: string | null;
};

export type HealthResponse = {
  status: string;
  service: string;
  forecast?: {
    enabled?: boolean;
    checkedAt?: string;
    ready?: boolean;
    source?: string;
    message?: string;
    nextUrl?: string;
  };
};

const SERVER_BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3001";
const ANALYTICS_BASE = process.env.NEXT_PUBLIC_ANALYTICS_URL ?? "http://localhost:8080";

function buildUrl(base: string, path: string): string {
  const normalizedBase = String(base || "").replace(/\/+$/, "");
  if (!normalizedBase) {
    return path;
  }

  return `${normalizedBase}${path}`;
}

async function requestJsonFromBase<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(base, path), {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error ?? `Request failed for ${path}`);
  }

  return data as T;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJsonFromBase(SERVER_BASE, path, init);
}

export function toDataUrl(base64Audio: string): string {
  return `data:audio/mpeg;base64,${base64Audio}`;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson("/health");
}

export async function fetchSimulatorStatus(): Promise<SimulatorControlResponse> {
  return requestJson("/simulator/status");
}

export async function startBackendSimulation(): Promise<SimulatorControlResponse> {
  return requestJson("/simulator/start", {
    method: "POST",
  });
}

export async function stopBackendSimulation(): Promise<SimulatorControlResponse> {
  return requestJson("/simulator/stop", {
    method: "POST",
  });
}

export async function fetchIcuSummary(): Promise<IcuSummaryResponse> {
  return requestJson("/icu/summary");
}

export async function fetchIcuTimeline(params?: {
  patientId?: string;
  limit?: number;
}): Promise<TimelineResponse> {
  const query = new URLSearchParams();

  if (params?.patientId) {
    query.set("patientId", params.patientId);
  }

  if (typeof params?.limit === "number") {
    query.set("limit", String(params.limit));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson(`/icu/timeline${suffix}`);
}

function appendForecastProjectionFilters(
  query: URLSearchParams,
  filters?: ForecastProjectionFilters
) {
  if (!filters) {
    return;
  }

  const patientId = String(filters.patientId || "").trim();
  if (patientId) {
    query.set("patientId", patientId);
  }

  if (Array.isArray(filters.patientIds) && filters.patientIds.length > 0) {
    const normalized = filters.patientIds
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0);

    if (normalized.length > 0) {
      query.set("patientIds", normalized.join(","));
    }
  }

  const from = String(filters.from || "").trim();
  if (from) {
    query.set("from", from);
  }

  const to = String(filters.to || "").trim();
  if (to) {
    query.set("to", to);
  }
}

export async function fetchForecastProjections(
  filters?: ForecastProjectionFilters
): Promise<ForecastProjectionResponse> {
  const query = new URLSearchParams();
  appendForecastProjectionFilters(query, filters);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson(`/icu/forecast/projection${suffix}`);
}

export async function downloadForecastProjectionExport(
  format: "csv" | "json",
  filters?: ForecastProjectionFilters
): Promise<Blob> {
  const query = new URLSearchParams();
  query.set("format", format);
  appendForecastProjectionFilters(query, filters);

  const response = await fetch(`${SERVER_BASE}/icu/forecast/projection/export?${query.toString()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Request failed for projection export (${response.status})`;
    try {
      const data = await response.json();
      if (data?.error) {
        message = String(data.error);
      }
    } catch {
      // Keep fallback message when response is not JSON.
    }

    throw new Error(message);
  }

  return response.blob();
}

export async function updateTelemetry(payload: {
  patientId: string;
  monitorId?: string;
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  bloodPressure?: string;
  hexPayload?: string;
  telemetryHex?: string;
  hex_payload?: string;
}): Promise<TelemetryUpdateResponse> {
  return requestJson("/telemetry/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function ingestTelemetryHex(hexPayload: string): Promise<TelemetryIngestResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/telemetry/ingest", {
    method: "POST",
    body: JSON.stringify({
      hex_payload: hexPayload,
    }),
  });
}

export async function fetchAnalyticsPatients(): Promise<AnalyticsPatientsResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/patients");
}

export async function fetchAnalyticsPatientById(patientId: string): Promise<AnalyticsPatientDetail> {
  const normalizedPatientId = String(patientId || "").trim();
  if (!normalizedPatientId) {
    throw new Error("patient_id is required");
  }

  return requestJsonFromBase(
    ANALYTICS_BASE,
    `/api/v1/patients/${encodeURIComponent(normalizedPatientId)}`
  );
}

export async function fetchAnalyticsAlerts(params?: {
  patientId?: string;
  limit?: number;
}): Promise<AnalyticsAlertsResponse> {
  const query = new URLSearchParams();

  const patientId = String(params?.patientId || "").trim();
  if (patientId) {
    query.set("patient_id", patientId);
  }

  if (typeof params?.limit === "number" && Number.isFinite(params.limit) && params.limit > 0) {
    query.set("limit", String(Math.round(params.limit)));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJsonFromBase(ANALYTICS_BASE, `/api/v1/alerts${suffix}`);
}

export async function analyzeTriage(payload: {
  patient_id?: string;
  vitals?: Record<string, unknown>;
}): Promise<TriageAnalysisResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/analysis/triage", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function forecastNext(payload: {
  patient_id: string;
  vitals?: number[][];
  feature_names?: string[];
}): Promise<ForecastNextResponse> {
  return requestJsonFromBase(ANALYTICS_BASE, "/api/v1/forecast/next", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchVoiceLogs(params?: {
  patientId?: string;
  language?: string;
  intent?: string;
  page?: number;
  limit?: number;
}): Promise<VoiceLogsResponse> {
  const query = new URLSearchParams();

  const patientId = String(params?.patientId || "").trim();
  const language = String(params?.language || "").trim();
  const intent = String(params?.intent || "").trim();

  if (patientId) {
    query.set("patientId", patientId);
  }

  if (language) {
    query.set("language", language);
  }

  if (intent) {
    query.set("intent", intent);
  }

  const page = Number(params?.page);
  if (Number.isFinite(page) && page > 0) {
    query.set("page", String(Math.round(page)));
  }

  const limit = Number(params?.limit);
  if (Number.isFinite(limit) && limit > 0) {
    query.set("limit", String(Math.round(limit)));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return requestJson(`/icu/voice-logs${suffix}`);
}

export async function fetchVoiceToken(): Promise<LiveKitTokenResponse> {
  return requestJson("/voice/token");
}

export async function fetchVoiceLanguages(): Promise<VoiceLanguagesResponse> {
  return requestJson("/voice/languages");
}

export async function fetchVoiceAlertState(): Promise<VoiceAlertStateResponse> {
  return requestJson("/voice/alert-state");
}

export async function queryVoice(payload: {
  text?: string;
  audioBase64?: string;
  language?: VoiceLanguage;
  userId?: string;
}): Promise<VoiceQueryResponse> {
  return requestJson("/voice/query", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
