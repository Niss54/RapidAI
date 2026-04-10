"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  downloadForecastProjectionExport,
  ForecastProjectionFilters,
  fetchForecastProjections,
  fetchHealth,
  fetchIcuSummary,
  fetchIcuTimeline,
  ForecastProjectionRecord,
  ForecastSourceSummary,
  IcuSummaryResponse,
  TimelineEvent,
  updateTelemetry,
} from "@/lib/api";
import AlertFeedPanel from "@/components/AlertFeedPanel";
import ForecastProjectionPanel from "@/components/ForecastProjectionPanel";
import PredictiveModelEvaluationSection from "@/components/PredictiveModelEvaluationSection";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";
import TelemetryDebugPanel, { TelemetryDebugEntry } from "@/components/TelemetryDebugPanel";
import EndpointCoveragePanel from "@/components/EndpointCoveragePanel";
import VoiceAssistantPanel from "@/components/VoiceAssistantPanel";
import VoiceServiceStatusPanel from "@/components/VoiceServiceStatusPanel";
import HexDecoderPanel from "@/components/HexDecoderPanel";
import IdentityCollisionPanel from "@/components/IdentityCollisionPanel";
import AlertsTimelinePanel from "@/components/AlertsTimelinePanel";
import ForecastWidget from "@/components/ForecastWidget";
import TelemetryTimelineChart from "@/components/TelemetryTimelineChart";
import ICUSummaryPanel from "@/components/ICUSummaryPanel";
import AlertsStreamWidget from "@/components/AlertsStreamWidget";
import VoiceLogsPanel from "@/components/VoiceLogsPanel";
import LiveKitStatusIndicator from "@/components/LiveKitStatusIndicator";
import RiskExplanationPanel from "@/components/RiskExplanationPanel";
import StabilityTimeline from "@/components/StabilityTimeline";
import SimulatorToggle from "@/components/SimulatorToggle";

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

function parsePatientIdsCsv(value: string): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toIsoFilterValue(value: string): string | undefined {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return undefined;
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function toDateTimeLocalInputValue(value: Date): string {
  const pad2 = (part: number) => String(part).padStart(2, "0");
  const year = value.getFullYear();
  const month = pad2(value.getMonth() + 1);
  const day = pad2(value.getDate());
  const hours = pad2(value.getHours());
  const minutes = pad2(value.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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
const PROJECTION_REFRESH_VISIBLE_MS = 20000;
const RISK_SCORE_LEGEND = "0-30 stable | 31-60 warning | 61-100 critical";
const PROJECTION_REFRESH_HIDDEN_MS = 90000;

type DashboardSectionId =
  | "icuSummary"
  | "stats"
  | "patientOps"
  | "hexDecoder"
  | "identityCollision"
  | "alertsTimeline"
  | "alertsStream"
  | "telemetryTimeline"
  | "stabilityTimeline"
  | "timeline"
  | "forecast"
  | "voiceAssistant"
  | "voiceLogs"
  | "voiceStatus"
  | "endpointCoverage"
  | "telemetryDebug"
  | "modelEvaluation";

const DASHBOARD_SECTION_TABS: Array<{ id: DashboardSectionId; label: string }> = [
  { id: "icuSummary", label: "ICU Summary" },
  { id: "stats", label: "Stats Cards" },
  { id: "patientOps", label: "Patient Snapshot + Push" },
  { id: "hexDecoder", label: "Hex Decoder" },
  { id: "identityCollision", label: "Identity Mapping" },
  { id: "alertsTimeline", label: "Alerts Timeline" },
  { id: "alertsStream", label: "Alerts Stream" },
  { id: "telemetryTimeline", label: "Telemetry Timeline" },
  { id: "stabilityTimeline", label: "Stability Timeline" },
  { id: "timeline", label: "Timeline + Alerts" },
  { id: "forecast", label: "Forecast Projections" },
  { id: "voiceAssistant", label: "Voice Assistant" },
  { id: "voiceLogs", label: "Voice Logs" },
  { id: "voiceStatus", label: "Voice Service Status" },
  { id: "endpointCoverage", label: "Endpoint Coverage" },
  { id: "telemetryDebug", label: "Telemetry Debug" },
  { id: "modelEvaluation", label: "Model Evaluation" },
];

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

function summarizeForecastSources(projections: ForecastProjectionRecord[]): ForecastSourceSummary {
  const summary: ForecastSourceSummary = {
    legacyMl: 0,
    heuristicFallback: 0,
    disabled: 0,
  };

  for (const projection of projections) {
    const source = String(projection.source || "").toLowerCase();
    if (source === "legacy-ml") {
      summary.legacyMl += 1;
    } else if (source === "disabled") {
      summary.disabled += 1;
    } else {
      summary.heuristicFallback += 1;
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
  const router = useRouter();
  const [healthService, setHealthService] = useState("rapid-ai-server");
  const [isForecastReady, setIsForecastReady] = useState(false);
  const [summaryData, setSummaryData] = useState<IcuSummaryResponse | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [forecastProjections, setForecastProjections] = useState<ForecastProjectionRecord[]>([]);
  const [forecastSourceSummary, setForecastSourceSummary] = useState<ForecastSourceSummary>({
    legacyMl: 0,
    heuristicFallback: 0,
    disabled: 0,
  });
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState("");
  const [exportingFormat, setExportingFormat] = useState<"csv" | "json" | null>(null);
  const [projectionFilterPatientIds, setProjectionFilterPatientIds] = useState("");
  const [projectionFilterFrom, setProjectionFilterFrom] = useState("");
  const [projectionFilterTo, setProjectionFilterTo] = useState("");
  const [riskHistoryByPatient, setRiskHistoryByPatient] = useState<RiskHistoryByPatient>({});
  const [telemetryDebugEntries, setTelemetryDebugEntries] = useState<TelemetryDebugEntry[]>([]);
  const [form, setForm] = useState<TelemetryForm>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [successToast, setSuccessToast] = useState<{ message: string; openedAt: number } | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardSectionId>("patientOps");
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [patientProfileSearchId, setPatientProfileSearchId] = useState("");

  const navigateToPatientProfile = useCallback(() => {
    const normalizedPatientId = String(patientProfileSearchId || "").trim();
    if (!normalizedPatientId) {
      return;
    }

    router.push(`/patients/${encodeURIComponent(normalizedPatientId)}`);
  }, [patientProfileSearchId, router]);

  const refresh = useCallback(async () => {
    const [health, summary, timeline] = await Promise.all([
      fetchHealth(),
      fetchIcuSummary(),
      fetchIcuTimeline({ limit: 20 }),
    ]);

    setHealthService(health.service);
    setIsForecastReady(Boolean(health.forecast?.ready));
    setSummaryData(summary);
    setTimelineEvents(timeline.events || []);
    setLastUpdatedAt(new Date().toISOString());
  }, []);

  const projectionFilters = useMemo(() => {
    const patientIds = parsePatientIdsCsv(projectionFilterPatientIds);
    const from = toIsoFilterValue(projectionFilterFrom);
    const to = toIsoFilterValue(projectionFilterTo);
    const hasInvalidRange = Boolean(from && to && new Date(from).getTime() > new Date(to).getTime());

    const filters: ForecastProjectionFilters = {};
    if (patientIds.length > 0) {
      filters.patientIds = patientIds;
    }
    if (from) {
      filters.from = from;
    }
    if (to) {
      filters.to = to;
    }

    return {
      filters,
      hasInvalidRange,
    };
  }, [projectionFilterPatientIds, projectionFilterFrom, projectionFilterTo]);

  const refreshForecastProjections = useCallback(async () => {
    if (projectionFilters.hasInvalidRange) {
      setForecastError("Invalid filter range: from must be before or equal to to.");
      return;
    }

    setForecastLoading(true);
    try {
      const projectionResponse = await fetchForecastProjections(projectionFilters.filters);
      const projections = projectionResponse.projections || [];
      setForecastProjections(projections);
      setForecastSourceSummary(projectionResponse.sourceSummary || summarizeForecastSources(projections));
      setForecastError("");
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : "Forecast projection refresh failed");
    } finally {
      setForecastLoading(false);
    }
  }, [projectionFilters]);

  const handleExportProjection = useCallback(async (format: "csv" | "json") => {
    if (projectionFilters.hasInvalidRange) {
      setForecastError("Invalid filter range: from must be before or equal to to.");
      return;
    }

    setExportingFormat(format);
    try {
      const fileBlob = await downloadForecastProjectionExport(format, projectionFilters.filters);
      const timestamp = new Date().toISOString().replace(/[.:]/g, "-");
      const objectUrl = window.URL.createObjectURL(fileBlob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `forecast-projections-${timestamp}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
      setForecastError("");
    } catch (err) {
      setForecastError(err instanceof Error ? err.message : "Forecast projection export failed");
    } finally {
      setExportingFormat(null);
    }
  }, [projectionFilters]);

  const handleApplyProjectionDatePreset = useCallback((hours: number) => {
    const safeHours = Number.isFinite(hours) && hours > 0 ? Math.round(hours) : 1;
    const now = new Date();
    const from = new Date(now.getTime() - safeHours * 60 * 60 * 1000);
    setProjectionFilterFrom(toDateTimeLocalInputValue(from));
    setProjectionFilterTo(toDateTimeLocalInputValue(now));
    setForecastError("");
  }, []);

  const handleClearProjectionFilters = useCallback(() => {
    setProjectionFilterPatientIds("");
    setProjectionFilterFrom("");
    setProjectionFilterTo("");
    setForecastError("");
  }, []);

  useEffect(() => {
    void refresh().catch((err) => {
      setIsForecastReady(false);
      setError(err instanceof Error ? err.message : "Could not load dashboard data");
    });

    const timer = setInterval(() => {
      void refresh().catch(() => {
        setIsForecastReady(false);
      });
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (delayMs: number) => {
      if (!active) {
        return;
      }

      timer = setTimeout(() => {
        void runPollCycle();
      }, delayMs);
    };

    const runPollCycle = async () => {
      if (!active) {
        return;
      }

      const isHidden = typeof document !== "undefined" && document.visibilityState !== "visible";
      if (!isHidden) {
        await refreshForecastProjections().catch(() => undefined);
      }

      scheduleNext(isHidden ? PROJECTION_REFRESH_HIDDEN_MS : PROJECTION_REFRESH_VISIBLE_MS);
    };

    void refreshForecastProjections().catch(() => undefined);
    scheduleNext(PROJECTION_REFRESH_VISIBLE_MS);

    const handleVisibilityChange = () => {
      if (!active || typeof document === "undefined") {
        return;
      }

      if (document.visibilityState === "visible") {
        if (timer) {
          clearTimeout(timer);
        }

        void refreshForecastProjections().catch(() => undefined);
        scheduleNext(PROJECTION_REFRESH_VISIBLE_MS);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshForecastProjections]);

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

  useEffect(() => {
    const nextPatients = summaryData?.patients ?? [];
    if (nextPatients.length === 0) {
      if (selectedPatientId) {
        setSelectedPatientId("");
      }
      return;
    }

    const selectedExists = nextPatients.some((patient) => patient.patientId === selectedPatientId);
    if (!selectedExists) {
      setSelectedPatientId(nextPatients[0].patientId);
    }
  }, [summaryData, selectedPatientId]);

  useEffect(() => {
    if (!successToast) {
      return;
    }

    const timer = setTimeout(() => {
      setSuccessToast(null);
    }, 2600);

    return () => {
      clearTimeout(timer);
    };
  }, [successToast]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccessToast(null);
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

      if (hexPayload && result.decodedVitals) {
        setTelemetryDebugEntries((previous) => {
          const nextEntry: TelemetryDebugEntry = {
            id: `${Date.now()}-${result.patient.patientId}`,
            patientId: result.patient.patientId,
            rawHexPayload: hexPayload,
            decodedHeartRate: Number(result.decodedVitals?.heartRate ?? result.patient.heartRate),
            decodedSpo2: Number(result.decodedVitals?.spo2 ?? result.patient.spo2),
            decodedTemperature: Number(result.decodedVitals?.temperature ?? result.patient.temperature),
            decodedBloodPressure: String(result.decodedVitals?.bloodPressure ?? result.patient.bloodPressure),
            source: String(result.decodedVitals?.source ?? "unknown"),
            monitorId: String(result.decodedVitals?.monitorId ?? form.monitorId ?? "unknown"),
            warnings: Array.isArray(result.decoderWarnings) ? result.decoderWarnings : [],
            createdAt: new Date().toISOString(),
          };

          return [nextEntry, ...previous].slice(0, 10);
        });
      }

      void refreshForecastProjections().catch(() => undefined);

      await refresh();
      setSuccessToast({
        message: "Telemetry Updated Successfully",
        openedAt: Date.now(),
      });
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
      {successToast ? (
        <div className="pointer-events-none fixed right-4 top-24 z-[80]">
          <p
            className="rounded-xl border border-emerald-500/45 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-200 shadow-[0_10px_30px_rgba(16,185,129,0.25)]"
            role="status"
            aria-live="polite"
          >
            {successToast.message}
          </p>
        </div>
      ) : null}

      <SiteNavbar lastUpdatedAt={lastUpdatedAt} />

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
                <div className="mt-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      isForecastReady
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                        : "border-rose-500/40 bg-rose-500/15 text-rose-300"
                    }`}
                  >
                    {isForecastReady ? "Forecast Ready" : "Forecast Offline"}
                  </span>
                </div>
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Forecast Source Split</p>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-md border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-200">
                    ML: <span className="font-semibold">{forecastSourceSummary.legacyMl}</span>
                  </div>
                  <div className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2 py-1 text-amber-200">
                    Fallback: <span className="font-semibold">{forecastSourceSummary.heuristicFallback}</span>
                  </div>
                  <div className="rounded-md border border-slate-500/35 bg-slate-500/10 px-2 py-1 text-slate-300">
                    Off: <span className="font-semibold">{forecastSourceSummary.disabled}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="surface sticky top-20 z-30 p-3">
          <div className="dashboard-tabs-track flex gap-2 overflow-x-auto pb-1">
            {DASHBOARD_SECTION_TABS.map((tab) => {
              const isActive = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
                    isActive
                      ? "border-cyan-500/50 bg-cyan-500/20 text-cyan-100"
                      : "border-white/15 bg-white/[0.03] text-slate-300 hover:border-cyan-500/35 hover:text-cyan-200"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Top buttons se section choose karo. Ek time par ek section dikh raha hai, isliye deep scroll ki zarurat nahi.
          </p>
        </section>

        {activeSection === "stats" ? (
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
        ) : null}

        {activeSection === "icuSummary" ? <ICUSummaryPanel /> : null}

        {activeSection === "patientOps" ? (
          <section className="grid gap-4 lg:grid-cols-[0.62fr_0.38fr]">
            <article className="surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold">Patient Snapshot</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className="input-dark min-w-52 rounded-xl px-3 py-2 text-sm"
                    placeholder="Search patient ID"
                    value={patientProfileSearchId}
                    onChange={(event) => setPatientProfileSearchId(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }

                      event.preventDefault();
                      navigateToPatientProfile();
                    }}
                  />
                  <button
                    type="button"
                    className="btn-base btn-ghost px-4 py-2 text-sm"
                    disabled={!String(patientProfileSearchId || "").trim()}
                    onClick={navigateToPatientProfile}
                  >
                    Open Profile
                  </button>
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
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-rose-500/45 bg-rose-500/15 px-3 py-1 text-rose-300">Red Critical</span>
                <span className="rounded-full border border-orange-500/45 bg-orange-500/15 px-3 py-1 text-orange-300">Orange Warning</span>
                <span className="rounded-full border border-emerald-500/45 bg-emerald-500/15 px-3 py-1 text-emerald-300">Green Stable</span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {patients.length === 0 ? (
                  <p className="feature-card p-4 text-sm muted md:col-span-2">No patient data yet. Push telemetry to start.</p>
                ) : (
                  patients.map((patient) => (
                    <article key={patient.patientId} className="feature-card p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-lg font-semibold text-slate-100">Patient {patient.patientId}</p>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass(patient.riskLevel)}`}>
                            {patient.riskLevel}
                          </span>
                          <button
                            type="button"
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition ${
                              selectedPatientId === patient.patientId
                                ? "border-cyan-500/45 bg-cyan-500/15 text-cyan-100"
                                : "border-white/20 bg-white/[0.03] text-slate-300 hover:border-cyan-500/35 hover:text-cyan-200"
                            }`}
                            onClick={() => setSelectedPatientId(patient.patientId)}
                          >
                            {selectedPatientId === patient.patientId ? "Selected" : "Select"}
                          </button>
                          <Link
                            href={`/patients/${encodeURIComponent(patient.patientId)}`}
                            className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-200 transition hover:border-cyan-400/60"
                          >
                            Open Profile
                          </Link>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-1 text-sm text-slate-300">
                        <p>HR: {patient.heartRate}</p>
                        <p>SpO2: {patient.spo2}</p>
                        <p>Temp: {patient.temperature}</p>
                        <p>BP: {patient.bloodPressure}</p>
                        <p>
                          Risk Score:{" "}
                          <span
                            className="font-semibold text-violet-300 underline decoration-dotted underline-offset-2"
                            title={RISK_SCORE_LEGEND}
                          >
                            {Math.round(Number(patient.riskScore) || 0)}/100
                          </span>
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

                      {selectedPatientId === patient.patientId ? (
                        <ForecastWidget
                          patientId={patient.patientId}
                          heartRate={patient.heartRate}
                          spo2={patient.spo2}
                          temperature={patient.temperature}
                          bloodPressure={patient.bloodPressure}
                          currentRiskScore={patient.riskScore}
                        />
                      ) : null}

                      <p className="mt-2 text-xs text-slate-500">Updated: {new Date(patient.lastUpdated).toLocaleString()}</p>
                    </article>
                  ))
                )}
              </div>
            </article>

            <aside className="surface p-5">
              <h2 className="text-2xl font-semibold">Push Telemetry</h2>
              <p className="mt-2 text-sm muted">Send structured vitals or paste hexadecimal telemetry payload directly.</p>

              <div className="mt-4">
                <SimulatorToggle />
              </div>

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
                <RiskExplanationPanel patientId={selectedPatientId} />

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
        ) : null}

        {activeSection === "hexDecoder" ? <HexDecoderPanel /> : null}

        {activeSection === "identityCollision" ? <IdentityCollisionPanel /> : null}

        {activeSection === "alertsTimeline" ? <AlertsTimelinePanel /> : null}

        {activeSection === "alertsStream" ? <AlertsStreamWidget /> : null}

        {activeSection === "telemetryTimeline" ? <TelemetryTimelineChart /> : null}

        {activeSection === "stabilityTimeline" ? <StabilityTimeline /> : null}

        {activeSection === "timeline" ? (
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
        ) : null}

        {activeSection === "forecast" ? (
          <ForecastProjectionPanel
            projections={forecastProjections}
            loading={forecastLoading}
            error={forecastError}
            filterPatientIds={projectionFilterPatientIds}
            filterFrom={projectionFilterFrom}
            filterTo={projectionFilterTo}
            onFilterPatientIdsChange={setProjectionFilterPatientIds}
            onFilterFromChange={setProjectionFilterFrom}
            onFilterToChange={setProjectionFilterTo}
            onApplyDatePreset={handleApplyProjectionDatePreset}
            onClearFilters={handleClearProjectionFilters}
            onRefresh={() => {
              void refreshForecastProjections();
            }}
            onExportCsv={() => {
              void handleExportProjection("csv");
            }}
            onExportJson={() => {
              void handleExportProjection("json");
            }}
            exportingFormat={exportingFormat}
          />
        ) : null}

        {activeSection === "voiceAssistant" ? <VoiceAssistantPanel /> : null}

        {activeSection === "voiceLogs" ? <VoiceLogsPanel /> : null}

        {activeSection === "voiceStatus" ? (
          <div className="space-y-4">
            <LiveKitStatusIndicator />
            <VoiceServiceStatusPanel />
          </div>
        ) : null}

        {activeSection === "endpointCoverage" ? <EndpointCoveragePanel /> : null}

        {activeSection === "telemetryDebug" ? <TelemetryDebugPanel entries={telemetryDebugEntries} /> : null}

        {activeSection === "modelEvaluation" ? <PredictiveModelEvaluationSection /> : null}

        {error ? <p className="rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}
      </main>

      <SiteFooter />
    </div>
  );
}
