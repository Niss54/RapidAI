"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchHealth,
  fetchIcuSummary,
  fetchIcuTimeline,
  IcuSummaryResponse,
  TimelineEvent,
  updateTelemetry,
} from "@/lib/api";
import AlertFeedPanel from "@/components/AlertFeedPanel";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";

type TelemetryForm = {
  patientId: string;
  monitorId: string;
  heartRate: string;
  spo2: string;
  temperature: string;
  bloodPressure: string;
  telemetryHex: string;
};

type RiskHistoryByPatient = Record<string, number[]>;

const DEFAULT_FORM: TelemetryForm = {
  patientId: "204",
  monitorId: "monitor-204",
  heartRate: "110",
  spo2: "91",
  temperature: "99.4",
  bloodPressure: "122/82",
  telemetryHex: "",
};

const RISK_HISTORY_LIMIT = 24;
const REFRESH_INTERVAL_MS = 3000;

function badgeClass(level: string): string {
  const normalized = level.toUpperCase();
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

function clampRiskScore(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeRiskLevel(level: string): "CRITICAL" | "MODERATE" | "WARNING" | "STABLE" {
  const normalized = String(level || "STABLE").toUpperCase();
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

function summarizePatients(patients: IcuSummaryResponse["patients"]): IcuSummaryResponse["summary"] {
  const summary = {
    critical: 0,
    moderate: 0,
    warning: 0,
    stable: 0,
    total: patients.length,
  };

  for (const patient of patients) {
    const riskLevel = normalizeRiskLevel(patient.riskLevel);
    if (riskLevel === "CRITICAL") {
      summary.critical += 1;
    } else if (riskLevel === "MODERATE") {
      summary.moderate += 1;
    } else if (riskLevel === "WARNING") {
      summary.warning += 1;
    } else {
      summary.stable += 1;
    }
  }

  return summary;
}

function RiskTrendChart({ values }: { values: number[] }) {
  const width = 240;
  const height = 68;
  const padding = 6;
  const normalized = values.map(clampRiskScore).slice(-RISK_HISTORY_LIMIT);

  if (normalized.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-500">
        Waiting for risk data...
      </div>
    );
  }

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const denominator = Math.max(1, normalized.length - 1);

  const points = normalized.map((value, index) => {
    const x = padding + (index / denominator) * innerWidth;
    const y = padding + ((100 - value) / 100) * innerHeight;
    return { x, y };
  });

  const linePoints = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const areaPath =
    points.length > 1
      ? `M ${first.x.toFixed(2)} ${height - padding} ${points
          .map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
          .join(" ")} L ${last.x.toFixed(2)} ${height - padding} Z`
      : "";

  return (
    <div className="space-y-1 rounded-lg border border-white/10 bg-black/20 px-2 py-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-full" role="img" aria-label="Risk score trend">
        {[25, 50, 75].map((level) => {
          const y = padding + ((100 - level) / 100) * innerHeight;
          return (
            <line
              key={level}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="rgba(148, 163, 184, 0.24)"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
          );
        })}

        {points.length > 1 ? <path d={areaPath} fill="rgba(139, 92, 246, 0.14)" /> : null}

        {points.length > 1 ? (
          <polyline
            points={linePoints}
            fill="none"
            stroke="rgba(167, 139, 250, 0.95)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <circle cx={first.x} cy={first.y} r="2.5" fill="rgba(167, 139, 250, 0.95)" />
        )}

        <circle cx={last.x} cy={last.y} r="2.8" fill="#22c55e" />
      </svg>

      <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
        <span>oldest</span>
        <span>latest: {normalized[normalized.length - 1]}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [healthService, setHealthService] = useState("rapid-ai-server");
  const [summaryData, setSummaryData] = useState<IcuSummaryResponse | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [riskHistoryByPatient, setRiskHistoryByPatient] = useState<RiskHistoryByPatient>({});
  const [form, setForm] = useState<TelemetryForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const [health, summary, timeline] = await Promise.all([
      fetchHealth(),
      fetchIcuSummary(),
      fetchIcuTimeline({ limit: 20 }),
    ]);

    setHealthService(health.service);
    setSummaryData(summary);
    setTimelineEvents(timeline.events || []);
  }, []);

  useEffect(() => {
    void refresh().catch((err) => {
      setError(err instanceof Error ? err.message : "Could not load dashboard data");
    });

    const timer = setInterval(() => {
      void refresh().catch(() => undefined);
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const patients = summaryData?.patients;
    if (!patients || patients.length === 0) {
      return;
    }

    setRiskHistoryByPatient((previous) => {
      const nextHistory: RiskHistoryByPatient = {};

      for (const patient of patients) {
        const patientId = String(patient.patientId);
        const nextScore = clampRiskScore(patient.riskScore);
        const existing = previous[patientId] ?? [];
        nextHistory[patientId] = [...existing, nextScore].slice(-RISK_HISTORY_LIMIT);
      }

      return nextHistory;
    });
  }, [summaryData]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const hexPayload = form.telemetryHex.trim();
      const result = await updateTelemetry(
        hexPayload
          ? {
              patientId: form.patientId,
              monitorId: form.monitorId,
              hexPayload,
            }
          : {
              patientId: form.patientId,
              monitorId: form.monitorId,
              heartRate: Number(form.heartRate),
              spo2: Number(form.spo2),
              temperature: Number(form.temperature),
              bloodPressure: form.bloodPressure,
            }
      );

      setSummaryData((previous) => {
        const existingPatients = previous?.patients ?? [];
        const nextPatients = [
          result.patient,
          ...existingPatients.filter((patient) => patient.patientId !== result.patient.patientId),
        ];

        return {
          summary: summarizePatients(nextPatients),
          patients: nextPatients,
        };
      });

      setRiskHistoryByPatient((previous) => {
        const patientId = String(result.patient.patientId);
        const history = previous[patientId] ?? [];
        return {
          ...previous,
          [patientId]: [...history, clampRiskScore(result.patient.riskScore)].slice(-RISK_HISTORY_LIMIT),
        };
      });

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telemetry push failed");
    } finally {
      setSubmitting(false);
    }
  }

  const summary = useMemo(
    () =>
      summaryData?.summary ?? {
        critical: 0,
        moderate: 0,
        warning: 0,
        stable: 0,
        total: 0,
      },
    [summaryData]
  );

  const patients = useMemo(() => summaryData?.patients ?? [], [summaryData]);

  return (
    <div className="page-shell pb-10">
      <SiteNavbar />

      <main className="container-wrap mt-8 space-y-5">
        <section className="surface p-6 md:p-8">
          <p className="kicker">Application Tracker</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-4xl font-semibold">Rapid AI Dashboard</h1>
              <p className="mt-2 muted">Track live patient load, risk distribution, and alert flow in one place.</p>
            </div>

            <div className="rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm">
              <p className="text-slate-300">Service: {healthService}</p>
              <p className="mt-1 text-slate-400">Auto-refresh every 3 seconds</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="stat-card p-4">
            <p className="kicker">Patients</p>
            <p className="mt-2 text-4xl font-semibold text-slate-100">{summary.total}</p>
          </article>
          <article className="stat-card p-4">
            <p className="kicker">Critical</p>
            <p className="mt-2 text-4xl font-semibold text-rose-400">{summary.critical}</p>
          </article>
          <article className="stat-card p-4">
            <p className="kicker">Moderate</p>
            <p className="mt-2 text-4xl font-semibold text-amber-400">{summary.moderate}</p>
          </article>
          <article className="stat-card p-4">
            <p className="kicker">Warning</p>
            <p className="mt-2 text-4xl font-semibold text-orange-400">{summary.warning}</p>
          </article>
          <article className="stat-card p-4">
            <p className="kicker">Stable</p>
            <p className="mt-2 text-4xl font-semibold text-emerald-400">{summary.stable}</p>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.62fr_0.38fr]">
          <article className="surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">Patient Snapshot</h2>
              <button
                type="button"
                className="btn-base btn-ghost px-4 py-2 text-sm"
                onClick={() => {
                  void refresh().catch((err) => {
                    setError(err instanceof Error ? err.message : "Refresh failed");
                  });
                }}
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {patients.length === 0 ? (
                <p className="feature-card p-4 text-sm muted md:col-span-2">No patient data yet. Push telemetry to start.</p>
              ) : (
                patients.map((patient) => (
                  <article key={patient.patientId} className="feature-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-lg font-semibold text-slate-100">Patient {patient.patientId}</p>
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(patient.riskLevel)}`}>
                        {patient.riskLevel}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-1 text-sm text-slate-300">
                      <p>HR: {patient.heartRate}</p>
                      <p>SpO2: {patient.spo2}</p>
                      <p>Temp: {patient.temperature}</p>
                      <p>BP: {patient.bloodPressure}</p>
                      <p>
                        Risk Score: <span className="font-semibold text-violet-300">{Math.round(Number(patient.riskScore) || 0)}/100</span>
                      </p>
                      <p>
                        Predicted Risk Next 5 Minutes:{" "}
                        <span className="font-semibold text-cyan-300">{patient.predictedRiskNext5Minutes}</span>
                      </p>
                    </div>

                    <div className="mt-3">
                      <p className="mb-1 text-xs uppercase tracking-[0.18em] text-slate-500">Risk Trend</p>
                      <RiskTrendChart
                        values={riskHistoryByPatient[patient.patientId] ?? [clampRiskScore(patient.riskScore)]}
                      />
                    </div>

                    <p className="mt-2 text-xs text-slate-500">Updated: {new Date(patient.lastUpdated).toLocaleString()}</p>
                  </article>
                ))
              )}
            </div>
          </article>

          <aside className="surface p-5">
            <h2 className="text-2xl font-semibold">Push Telemetry</h2>
            <p className="mt-2 text-sm muted">Send structured vitals or paste hexadecimal telemetry payload directly.</p>

            <form className="mt-4 grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
              <input
                className="input-dark rounded-xl px-3 py-2 text-sm"
                placeholder="Patient ID"
                value={form.patientId}
                onChange={(event) => setForm((prev) => ({ ...prev, patientId: event.target.value }))}
              />
              <input
                className="input-dark rounded-xl px-3 py-2 text-sm"
                placeholder="Monitor ID"
                value={form.monitorId}
                onChange={(event) => setForm((prev) => ({ ...prev, monitorId: event.target.value }))}
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="input-dark rounded-xl px-3 py-2 text-sm"
                  placeholder="HR"
                  value={form.heartRate}
                  onChange={(event) => setForm((prev) => ({ ...prev, heartRate: event.target.value }))}
                />
                <input
                  className="input-dark rounded-xl px-3 py-2 text-sm"
                  placeholder="SpO2"
                  value={form.spo2}
                  onChange={(event) => setForm((prev) => ({ ...prev, spo2: event.target.value }))}
                />
                <input
                  className="input-dark rounded-xl px-3 py-2 text-sm"
                  placeholder="Temp"
                  value={form.temperature}
                  onChange={(event) => setForm((prev) => ({ ...prev, temperature: event.target.value }))}
                />
              </div>
              <input
                className="input-dark rounded-xl px-3 py-2 text-sm"
                placeholder="BP"
                value={form.bloodPressure}
                onChange={(event) => setForm((prev) => ({ ...prev, bloodPressure: event.target.value }))}
              />

              <textarea
                className="input-dark min-h-24 rounded-xl px-3 py-2 text-sm"
                placeholder="Hex telemetry payload (optional). If provided, decoder will extract HR, SpO2, Temp, BP before risk analysis."
                value={form.telemetryHex}
                onChange={(event) => setForm((prev) => ({ ...prev, telemetryHex: event.target.value }))}
              />

              <p className="text-xs text-slate-500">
                Hex mode: keep Patient ID + Hex payload. Structured fields are optional when hex is present.
              </p>

              <button type="submit" className="btn-base btn-green px-4 py-2 text-sm" disabled={submitting}>
                {submitting ? "Submitting..." : "Push Telemetry"}
              </button>
            </form>

            <div className="mt-5 grid gap-2">
              <Link href="/chat" className="quick-card flex items-center justify-between p-3 text-sm">
                <span>Open Patient Chat</span>
                <span className="text-slate-500">\u2192</span>
              </Link>
              <Link href="/" className="quick-card flex items-center justify-between p-3 text-sm">
                <span>Back To Home</span>
                <span className="text-slate-500">\u2192</span>
              </Link>
            </div>
          </aside>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.64fr_0.36fr]">
          <article className="surface p-5">
            <h2 className="text-2xl font-semibold">Recent Timeline</h2>
            <div className="mt-4 space-y-3">
              {timelineEvents.length === 0 ? (
                <p className="feature-card p-4 text-sm muted">No timeline events yet.</p>
              ) : (
                timelineEvents.map((event) => (
                  <article key={event.id} className="feature-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-100">
                        {event.eventType === "alert" ? "Alert Event" : "Telemetry Event"} - Patient {event.patientId}
                      </p>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(
                          event.riskLevel ?? (event.eventType === "alert" ? "WARNING" : "STABLE")
                        )}`}
                      >
                        {event.eventType === "alert"
                          ? event.delivered
                            ? "ALERT SENT"
                            : "ALERT FAILED"
                          : event.riskLevel || "STABLE"}
                      </span>
                    </div>

                    {event.eventType === "telemetry" ? (
                      <div className="mt-2 grid gap-1 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
                        <p>HR: {event.telemetry?.heartRate ?? "-"}</p>
                        <p>SpO2: {event.telemetry?.spo2 ?? "-"}</p>
                        <p>Temp: {event.telemetry?.temperature ?? "-"}</p>
                        <p>BP: {event.telemetry?.bloodPressure ?? "-"}</p>
                      </div>
                    ) : (
                      <div className="mt-2 grid gap-1 text-sm text-slate-300">
                        <p>Message: {event.message || "-"}</p>
                        <p>Language: {event.language || "-"}</p>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString()}</p>
                  </article>
                ))
              )}
            </div>
          </article>

          <AlertFeedPanel events={timelineEvents} />
        </section>

        {error ? <p className="rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
      </main>

      <SiteFooter />
    </div>
  );
}
