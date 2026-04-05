export type PatientRecord = {
  patientId: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
  riskLevel: string;
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

export type LiveKitTokenResponse = {
  token: string;
  roomName: string;
  identity: string;
  wsUrl: string;
};

export type VoiceQueryResponse = {
  transcript: string;
  intent: "PATIENT_STATUS" | "ICU_SUMMARY" | "LANGUAGE_SWITCH";
  patientId: string | null;
  language: "en" | "hi";
  responseText: string;
  audioBase64: string | null;
};

export type TelemetryUpdateResponse = {
  patient: PatientRecord;
  risk: {
    patientId: string;
    riskLevel: "CRITICAL" | "MODERATE" | "WARNING" | "STABLE";
    reason: string;
  };
  alert: {
    text: string;
    language: "en" | "hi";
    audioBase64: string | null;
    delivered: boolean;
    deliveryReason: string | null;
  } | null;
};

const SERVER_BASE = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${SERVER_BASE}${path}`, {
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

export function toDataUrl(base64Audio: string): string {
  return `data:audio/mpeg;base64,${base64Audio}`;
}

export async function fetchHealth(): Promise<{ status: string; service: string }> {
  return requestJson("/health");
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

export async function updateTelemetry(payload: {
  patientId: string;
  heartRate: number;
  spo2: number;
  temperature: number;
  bloodPressure: string;
}): Promise<TelemetryUpdateResponse> {
  return requestJson("/telemetry/update", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchVoiceToken(): Promise<LiveKitTokenResponse> {
  return requestJson("/voice/token");
}

export async function queryVoice(payload: {
  text?: string;
  audioBase64?: string;
  language?: "en" | "hi";
}): Promise<VoiceQueryResponse> {
  return requestJson("/voice/query", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
