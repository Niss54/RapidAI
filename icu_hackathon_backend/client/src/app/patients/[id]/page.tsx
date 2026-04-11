"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  analyzeTriage,
  AnalyticsAlertRecord,
  AnalyticsPatientDetail,
  fetchAnalyticsAlerts,
  fetchAnalyticsPatientById,
  fetchForecastProjections,
  fetchIcuSummary,
  fetchIcuTimeline,
  fetchVoiceLogs,
  ForecastProjectionRecord,
  PatientRecord,
  TimelineEvent,
  TriageAnalysisResponse,
  VoiceLogRecord,
} from "@/lib/api";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";

const AUTO_REFRESH_MS = 5000;
const RISK_SCORE_LEGEND = "0-30 stable | 31-60 warning | 61-100 critical";

function normalizeRoutePatientId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
}

function toTimestampMs(value: unknown): number {
  if (typeof value === "number") {
    const asMs = value > 1_000_000_000_000 ? value : value * 1000;
    return Number.isFinite(asMs) ? asMs : 0;
  }

  const parsed = new Date(String(value || "")).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value: unknown): string {
  const ms = toTimestampMs(value);
  if (ms <= 0) {
    return "-";
  }

  return new Date(ms).toLocaleString();
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRoundedMetric(value: unknown, digits = 0): string {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return "-";
  }

  return parsed.toFixed(digits);
}

function readNumericVital(map: Record<string, unknown> | null | undefined, keys: string[]): number | null {
  if (!map) {
    return null;
  }

  for (const key of keys) {
    if (!(key in map)) {
      continue;
    }

    const parsed = toFiniteNumber(map[key]);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function readTextVital(map: Record<string, unknown> | null | undefined, keys: string[]): string {
  if (!map) {
    return "";
  }

  for (const key of keys) {
    if (!(key in map)) {
      continue;
    }

    const value = String(map[key] || "").trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeRiskLevel(value: unknown): "CRITICAL" | "MODERATE" | "WARNING" | "STABLE" {
  const normalized = String(value || "STABLE").trim().toUpperCase();
  if (normalized === "CRITICAL") {
    return "CRITICAL";
  }
  if (normalized === "MODERATE") {
    return "MODERATE";
  }
  if (normalized === "WARNING") {
    return "WARNING";
  }
  return "STABLE";
}

function riskBadgeClass(level: string): string {
  const normalized = normalizeRiskLevel(level);
  if (normalized === "CRITICAL") {
    return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
  if (normalized === "MODERATE") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }
  if (normalized === "WARNING") {
    return "border-orange-500/40 bg-orange-500/15 text-orange-300";
  }
  return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
}

function triagePriorityBadgeClass(priority: string): string {
  const normalized = String(priority || "").toUpperCase();
  if (normalized.includes("P1") || normalized.includes("IMMEDIATE")) {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }
  if (normalized.includes("P2") || normalized.includes("RAPID")) {
    return "border-amber-500/45 bg-amber-500/15 text-amber-300";
  }
  if (normalized.includes("P3") || normalized.includes("MONITOR")) {
    return "border-orange-500/45 bg-orange-500/15 text-orange-300";
  }
  return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  return null;
}

function resolveCooldownSeconds(alert: AnalyticsAlertRecord): number {
  const raw = alert.cooldown_remaining_seconds ?? alert.cooldownRemainingSeconds;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(parsed));
}

function resolveDuplicateSuppressed(alert: AnalyticsAlertRecord): boolean {
  const explicit = toBoolean(alert.duplicate_suppressed ?? alert.duplicateSuppressed);
  if (explicit !== null) {
    return explicit;
  }

  return resolveCooldownSeconds(alert) > 0;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "Unknown error");
}

export default function PatientDetailPage() {
  const params = useParams();
  const patientId = useMemo(() => normalizeRoutePatientId(params?.id), [params]);

  const [summaryPatient, setSummaryPatient] = useState<PatientRecord | null>(null);
  const [analyticsPatient, setAnalyticsPatient] = useState<AnalyticsPatientDetail | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [alerts, setAlerts] = useState<AnalyticsAlertRecord[]>([]);
  const [projection, setProjection] = useState<ForecastProjectionRecord | null>(null);
  const [triage, setTriage] = useState<TriageAnalysisResponse | null>(null);
  const [voiceLogs, setVoiceLogs] = useState<VoiceLogRecord[]>([]);
  const [voiceLogsTotal, setVoiceLogsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshPatient = useCallback(
    async (showLoadingState: boolean) => {
      if (!patientId) {
        setSummaryPatient(null);
        setAnalyticsPatient(null);
        setTimelineEvents([]);
        setAlerts([]);
        setProjection(null);
        setTriage(null);
        setVoiceLogs([]);
        setVoiceLogsTotal(0);
        setError("Invalid patient id in route.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showLoadingState) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const failures: string[] = [];

      try {
        const [
          summaryResult,
          analyticsResult,
          timelineResult,
          alertsResult,
          projectionResult,
          triageResult,
          voiceResult,
        ] = await Promise.allSettled([
          fetchIcuSummary(),
          fetchAnalyticsPatientById(patientId),
          fetchIcuTimeline({ patientId, limit: 40 }),
          fetchAnalyticsAlerts({ patientId, limit: 50 }),
          fetchForecastProjections({ patientId }),
          analyzeTriage({ patient_id: patientId }),
          fetchVoiceLogs({ patientId, page: 1, limit: 50 }),
        ]);

        let nextSummaryPatient: PatientRecord | null = null;
        let nextAnalyticsPatient: AnalyticsPatientDetail | null = null;
        let nextTimeline: TimelineEvent[] = [];
        let nextAlerts: AnalyticsAlertRecord[] = [];
        let nextProjection: ForecastProjectionRecord | null = null;
        let nextTriage: TriageAnalysisResponse | null = null;
        let nextVoiceLogs: VoiceLogRecord[] = [];
        let nextVoiceLogsTotal = 0;

        if (summaryResult.status === "fulfilled") {
          const patients = Array.isArray(summaryResult.value.patients) ? summaryResult.value.patients : [];
          nextSummaryPatient = patients.find((patient) => String(patient.patientId) === patientId) || null;
        } else {
          failures.push(`summary: ${toErrorMessage(summaryResult.reason)}`);
        }

        if (analyticsResult.status === "fulfilled") {
          nextAnalyticsPatient = analyticsResult.value;
        } else {
          const analyticsError = toErrorMessage(analyticsResult.reason);
          if (!/not found/i.test(analyticsError)) {
            failures.push(`patient detail: ${analyticsError}`);
          }
        }

        if (timelineResult.status === "fulfilled") {
          nextTimeline = Array.isArray(timelineResult.value.events) ? timelineResult.value.events : [];
        } else {
          failures.push(`timeline: ${toErrorMessage(timelineResult.reason)}`);
        }

        if (alertsResult.status === "fulfilled") {
          nextAlerts = Array.isArray(alertsResult.value.alerts) ? alertsResult.value.alerts : [];
        } else {
          failures.push(`alerts: ${toErrorMessage(alertsResult.reason)}`);
        }

        if (projectionResult.status === "fulfilled") {
          const projections = Array.isArray(projectionResult.value.projections)
            ? projectionResult.value.projections
            : [];
          nextProjection = projections[0] || null;
        } else {
          failures.push(`forecast: ${toErrorMessage(projectionResult.reason)}`);
        }

        if (triageResult.status === "fulfilled") {
          nextTriage = triageResult.value;
        } else {
          failures.push(`triage: ${toErrorMessage(triageResult.reason)}`);
        }

        if (voiceResult.status === "fulfilled") {
          nextVoiceLogs = Array.isArray(voiceResult.value.logs) ? voiceResult.value.logs : [];
          nextVoiceLogsTotal = Number(voiceResult.value.total) || nextVoiceLogs.length;
        } else {
          failures.push(`voice logs: ${toErrorMessage(voiceResult.reason)}`);
        }

        const hasAnyData =
          Boolean(nextSummaryPatient) ||
          Boolean(nextAnalyticsPatient) ||
          nextTimeline.length > 0 ||
          nextAlerts.length > 0 ||
          Boolean(nextProjection) ||
          Boolean(nextTriage) ||
          nextVoiceLogs.length > 0;

        if (!hasAnyData && failures.length === 0) {
          failures.push(`Patient ${patientId} not found in currently available streams.`);
        }

        setSummaryPatient(nextSummaryPatient);
        setAnalyticsPatient(nextAnalyticsPatient);
        setTimelineEvents(nextTimeline);
        setAlerts(nextAlerts);
        setProjection(nextProjection);
        setTriage(nextTriage);
        setVoiceLogs(nextVoiceLogs);
        setVoiceLogsTotal(nextVoiceLogsTotal);
        setError(failures.join(" | "));
        setLastSyncedAt(new Date().toISOString());
      } finally {
        if (showLoadingState) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [patientId]
  );

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async (showLoadingState: boolean) => {
      if (!active) {
        return;
      }

      await refreshPatient(showLoadingState);
    };

    void run(true);
    intervalId = setInterval(() => {
      void run(false);
    }, AUTO_REFRESH_MS);

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refreshPatient]);

  const latestVitals = analyticsPatient?.latest_vitals || null;

  const vitalHeartRate = summaryPatient?.heartRate ?? readNumericVital(latestVitals, ["heartRate", "heart_rate", "hr"]);
  const vitalSpo2 = summaryPatient?.spo2 ?? readNumericVital(latestVitals, ["spo2", "spO2"]);
  const vitalTemperature =
    summaryPatient?.temperature ??
    readNumericVital(latestVitals, ["temperature", "temp", "bodyTemperature", "body_temperature"]);
  const vitalBloodPressure =
    summaryPatient?.bloodPressure ||
    readTextVital(latestVitals, ["bloodPressure", "blood_pressure", "bp", "nibp"]);

  const riskScore = summaryPatient?.riskScore ?? analyticsPatient?.risk_score ?? projection?.currentRiskScore ?? null;
  const riskLevel =
    summaryPatient?.riskLevel || analyticsPatient?.risk_level || projection?.predictedDeteriorationState || "STABLE";

  const predictedRisk =
    summaryPatient?.predictedRiskNext5Minutes || projection?.predictedDeteriorationState || "UNKNOWN";

  const updatedAtLabel = formatTimestamp(summaryPatient?.lastUpdated || analyticsPatient?.updated_at || "");

  const orderedTimeline = useMemo(() => {
    return [...timelineEvents].sort((a, b) => toTimestampMs(b.occurredAt) - toTimestampMs(a.occurredAt));
  }, [timelineEvents]);

  const orderedAlerts = useMemo(() => {
    return [...alerts].sort((a, b) => toTimestampMs(b.timestamp || 0) - toTimestampMs(a.timestamp || 0));
  }, [alerts]);

  const orderedVoiceLogs = useMemo(() => {
    return [...voiceLogs].sort((a, b) => toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp));
  }, [voiceLogs]);

  return (
    <div className="page-shell pb-12">
      <SiteNavbar lastUpdatedAt={lastSyncedAt} />

      <main className="container-wrap mt-8 space-y-4 pb-10">
        <section className="surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="kicker">Patient Detail Route</p>
              <h1 className="mt-1 text-3xl font-semibold text-slate-100">Patient {patientId || "-"}</h1>
              <p className="mt-2 text-sm text-slate-400">
                Combined view for vitals, risk timeline, alerts history, forecast prediction, and voice logs.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn-base btn-ghost px-4 py-2 text-sm"
                disabled={loading || refreshing}
                onClick={() => {
                  void refreshPatient(false);
                }}
              >
                {refreshing ? "Refreshing..." : "Refresh"}
              </button>
              <Link href="/dashboard" className="btn-base btn-ghost px-4 py-2 text-sm">
                Back to Dashboard
              </Link>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Auto refresh: {AUTO_REFRESH_MS} ms</span>
            <span>|</span>
            <span>Last sync: {lastSyncedAt ? formatTimestamp(lastSyncedAt) : "-"}</span>
          </div>

          {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="stat-card p-4">
            <p className="kicker">Heart Rate</p>
            <p className="mt-2 text-3xl font-semibold text-slate-100">{toRoundedMetric(vitalHeartRate)} bpm</p>
          </article>
          <article className="stat-card p-4">
            <p className="kicker">SpO2</p>
            <p className="mt-2 text-3xl font-semibold text-slate-100">{toRoundedMetric(vitalSpo2)}%</p>
          </article>
          <article className="stat-card p-4">
            <p className="kicker">Temperature</p>
            <p className="mt-2 text-3xl font-semibold text-slate-100">{toRoundedMetric(vitalTemperature, 1)} F</p>
          </article>
          <article className="stat-card p-4">
            <p className="kicker">Blood Pressure</p>
            <p className="mt-2 text-3xl font-semibold text-slate-100">{vitalBloodPressure || "-"}</p>
          </article>
        </section>

        <section className="surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold">Current Risk Snapshot</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(riskLevel)}`}>
              {normalizeRiskLevel(riskLevel)}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full border border-rose-500/45 bg-rose-500/15 px-3 py-1 text-rose-300">Red Critical</span>
            <span className="rounded-full border border-orange-500/45 bg-orange-500/15 px-3 py-1 text-orange-300">Orange Warning</span>
            <span className="rounded-full border border-emerald-500/45 bg-emerald-500/15 px-3 py-1 text-emerald-300">Green Stable</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="feature-card p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Risk Score</p>
              <p
                className="mt-2 text-2xl font-semibold text-violet-300 underline decoration-dotted underline-offset-4"
                title={RISK_SCORE_LEGEND}
              >
                {toFiniteNumber(riskScore) === null ? "-" : Math.round(Number(riskScore))}/100
              </p>
            </article>
            <article className="feature-card p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Predicted Next 5m</p>
              <p className="mt-2 text-2xl font-semibold text-cyan-300">{predictedRisk}</p>
            </article>
            <article className="feature-card p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Last Updated</p>
              <p className="mt-2 text-sm font-medium text-slate-200">{updatedAtLabel}</p>
            </article>
          </div>
        </section>

        <section className="surface p-5">
          <h2 className="text-2xl font-semibold">Triage Analysis</h2>
          <p className="mt-1 text-sm text-slate-400">POST /api/v1/analysis/triage</p>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="feature-card p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Triage Priority</p>
              <p className="mt-2">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${triagePriorityBadgeClass(
                    String(triage?.triage_priority || "")
                  )}`}
                >
                  {String(triage?.triage_priority || "-")}
                </span>
              </p>
            </article>

            <article className="feature-card p-4 md:col-span-2">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Recommended Escalation</p>
              <p className="mt-2 text-sm font-medium text-slate-200">
                {String(triage?.recommended_escalation || "-")}
              </p>
            </article>

            <article className="feature-card p-4 md:col-span-3">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Risk Explanation Summary</p>
              <p className="mt-2 text-sm text-slate-200">
                {String(triage?.risk_explanation_summary || "-")}
              </p>
            </article>
          </div>
        </section>

        <section className="surface p-5">
          <h2 className="text-2xl font-semibold">Risk Timeline</h2>
          <p className="mt-1 text-sm text-slate-400">Telemetry and alert events from /icu/timeline for this patient.</p>

          <div className="mt-4 space-y-3">
            {loading ? (
              <p className="feature-card p-4 text-sm text-slate-400">Loading timeline...</p>
            ) : orderedTimeline.length === 0 ? (
              <p className="feature-card p-4 text-sm text-slate-400">No risk timeline events available yet.</p>
            ) : (
              orderedTimeline.map((event) => (
                <article key={event.id} className="feature-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-100">
                      {event.eventType === "alert" ? "Alert Event" : "Telemetry Event"}
                    </p>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskBadgeClass(
                        event.riskLevel || (event.eventType === "alert" ? "WARNING" : "STABLE")
                      )}`}
                    >
                      {event.eventType === "alert"
                        ? event.delivered
                          ? "ALERT SENT"
                          : "ALERT FAILED"
                        : normalizeRiskLevel(event.riskLevel || "STABLE")}
                    </span>
                  </div>

                  {event.eventType === "telemetry" ? (
                    <div className="mt-2 grid gap-1 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
                      <p>HR: {event.telemetry?.heartRate ?? "-"}</p>
                      <p>SpO2: {event.telemetry?.spo2 ?? "-"}</p>
                      <p>Temp: {event.telemetry?.temperature ?? "-"}</p>
                      <p>BP: {event.telemetry?.bloodPressure ?? "-"}</p>
                      <p className="md:col-span-2 lg:col-span-4">Reason: {event.reason || "-"}</p>
                    </div>
                  ) : (
                    <div className="mt-2 grid gap-1 text-sm text-slate-300">
                      <p>Alert Type: {event.alertType || "-"}</p>
                      <p>Message: {event.message || "-"}</p>
                      <p>Language: {event.language || "-"}</p>
                      <p>
                        delivery_channels: {event.deliveryChannels && event.deliveryChannels.length > 0
                          ? event.deliveryChannels.join(", ")
                          : "-"}
                      </p>
                    </div>
                  )}

                  <p className="mt-2 text-xs text-slate-500">{formatTimestamp(event.occurredAt)}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="surface p-5">
          <h2 className="text-2xl font-semibold">Alerts History</h2>
          <p className="mt-1 text-sm text-slate-400">Recent alerts from /api/v1/alerts for this patient.</p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="bg-black/25 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">severity</th>
                  <th className="px-3 py-3">reason</th>
                  <th className="px-3 py-3">risk_score</th>
                  <th className="px-3 py-3">duplicate suppressed</th>
                  <th className="px-3 py-3">cooldown</th>
                  <th className="px-3 py-3">timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-400">
                      Loading alerts...
                    </td>
                  </tr>
                ) : orderedAlerts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-400">
                      No alerts history available yet.
                    </td>
                  </tr>
                ) : (
                  orderedAlerts.map((alert, index) => {
                    const severity = String(alert.severity || "stable").toUpperCase();
                    const reason = String(alert.reason || alert.alert_reason || "-");
                    const riskScoreText = toRoundedMetric(alert.risk_score);
                    const duplicateSuppressed = resolveDuplicateSuppressed(alert);
                    const cooldown = resolveCooldownSeconds(alert);

                    return (
                      <tr key={`${patientId}-alert-${index}-${String(alert.timestamp || "0")}`} className="border-t border-white/10">
                        <td className="px-3 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${riskBadgeClass(severity)}`}>
                            {severity}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-100">{reason}</td>
                        <td className="px-3 py-3 text-slate-200">{riskScoreText === "-" ? "-" : `${riskScoreText}/100`}</td>
                        <td className="px-3 py-3 text-slate-200">{duplicateSuppressed ? "true" : "false"}</td>
                        <td className="px-3 py-3 text-slate-200">{cooldown}s</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{formatTimestamp(alert.timestamp || 0)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="surface p-5">
          <h2 className="text-2xl font-semibold">Forecast Prediction</h2>
          <p className="mt-1 text-sm text-slate-400">Latest /icu/forecast/projection entry for this patient.</p>

          {projection ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <article className="feature-card p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Current Risk</p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">{Math.round(projection.currentRiskScore)}/100</p>
              </article>
              <article className="feature-card p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Future Risk (5m)</p>
                <p className="mt-2 text-2xl font-semibold text-slate-100">{Math.round(projection.futureRiskScore)}/100</p>
              </article>
              <article className="feature-card p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Predicted State</p>
                <p className="mt-2 text-xl font-semibold text-cyan-300">{projection.predictedDeteriorationState}</p>
              </article>
              <article className="feature-card p-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Source</p>
                <p className="mt-2 text-sm font-semibold text-slate-200">{projection.source}</p>
              </article>

              <article className="feature-card p-4 md:col-span-2 xl:col-span-4">
                <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Timeline Projection</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {projection.timelineProjection.map((point) => (
                    <span
                      key={`minute-${point.minute}`}
                      className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-slate-200"
                    >
                      {point.minute}m: {Math.round(point.riskScore)}
                    </span>
                  ))}
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  Forecast vector: {Array.isArray(projection.forecastedVitals) ? projection.forecastedVitals.join(", ") : "-"}
                </p>
                {projection.warning ? <p className="mt-2 text-xs text-amber-300">Warning: {projection.warning}</p> : null}
              </article>
            </div>
          ) : (
            <p className="mt-4 feature-card p-4 text-sm text-slate-400">No projection available for this patient yet.</p>
          )}
        </section>

        <section className="surface p-5">
          <h2 className="text-2xl font-semibold">Voice Logs</h2>
          <p className="mt-1 text-sm text-slate-400">Recent /icu/voice-logs records scoped by patient id.</p>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
            <table className="min-w-full text-left text-sm text-slate-300">
              <thead className="bg-black/25 text-xs uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">query_text</th>
                  <th className="px-3 py-3">intent</th>
                  <th className="px-3 py-3">language</th>
                  <th className="px-3 py-3">response_summary</th>
                  <th className="px-3 py-3">timestamp</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-slate-400">
                      Loading voice logs...
                    </td>
                  </tr>
                ) : orderedVoiceLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-slate-400">
                      No voice logs available for this patient yet.
                    </td>
                  </tr>
                ) : (
                  orderedVoiceLogs.map((row) => (
                    <tr key={row.id} className="border-t border-white/10 align-top">
                      <td className="px-3 py-3 text-slate-100">{row.query_text || "-"}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-1 text-xs text-cyan-200">
                          {row.detected_intent || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-200">{row.language || "-"}</td>
                      <td className="px-3 py-3 text-slate-300">{row.response_summary || "-"}</td>
                      <td className="px-3 py-3 text-xs text-slate-500">{formatTimestamp(row.timestamp)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-slate-500">Rows: {voiceLogsTotal}</p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
