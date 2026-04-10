"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnalyticsPatientState, fetchAnalyticsPatients } from "@/lib/api";

type IdentityCollisionRow = {
  monitorId: string;
  patientId: string;
  resolutionStrategy: string;
  timestampMs: number;
  timestampLabel: string;
};

function toSafeMonitorId(value: unknown): string {
  const normalized = String(value || "").trim();
  return normalized || "unknown_monitor";
}

function toSafePatientId(value: unknown): string {
  const normalized = String(value || "").trim();
  return normalized || "unknown_patient";
}

function toResolutionStrategy(value: unknown, patientId: string): string {
  const normalized = String(value || "").trim();
  if (normalized) {
    return normalized;
  }

  if (patientId.toLowerCase().startsWith("anon_")) {
    return "anonymous-bind";
  }

  return "monitor-binding";
}

function toUpdatedEpochSeconds(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }

  return parsed;
}

function toUpdatedLabel(epochSeconds: number): string {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) {
    return "-";
  }

  return new Date(epochSeconds * 1000).toLocaleString();
}

function buildRows(patients: AnalyticsPatientState[]): IdentityCollisionRow[] {
  const rows = patients.map((patient) => {
    const monitorId = toSafeMonitorId(patient.monitor_id ?? patient.last_source);
    const patientId = toSafePatientId(patient.patient_id);
    const resolutionStrategy = toResolutionStrategy(patient.resolution_strategy, patientId);
    const timestampMs = toUpdatedEpochSeconds(patient.timestamp ?? patient.updated_at);

    return {
      monitorId,
      patientId,
      resolutionStrategy,
      timestampMs,
      timestampLabel: toUpdatedLabel(timestampMs),
    };
  });

  rows.sort((a, b) => b.timestampMs - a.timestampMs);
  return rows;
}

function strategyBadgeClass(strategy: string): string {
  const normalized = String(strategy || "").trim().toLowerCase();
  if (normalized.includes("collision") || normalized.includes("fallback")) {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }

  if (normalized.includes("anonymous")) {
    return "border-amber-500/45 bg-amber-500/15 text-amber-300";
  }

  if (normalized.includes("direct")) {
    return "border-emerald-500/40 bg-emerald-500/12 text-emerald-300";
  }

  return "border-cyan-500/40 bg-cyan-500/12 text-cyan-300";
}

export default function IdentityCollisionPanel() {
  const [rows, setRows] = useState<IdentityCollisionRow[]>([]);
  const [searchMonitorId, setSearchMonitorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshData = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetchAnalyticsPatients();
      const patientRows = Array.isArray(response.patients) ? response.patients : [];
      setRows(buildRows(patientRows));
      setLastSyncedAt(new Date().toISOString());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load identity mapping data");
    } finally {
      if (showLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async (showLoadingState: boolean) => {
      if (!active) {
        return;
      }

      await refreshData(showLoadingState);
    };

    void run(true);
    intervalId = setInterval(() => {
      void run(false);
    }, 5000);

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refreshData]);

  const filteredRows = useMemo(() => {
    const needle = searchMonitorId.trim().toLowerCase();
    if (!needle) {
      return rows;
    }

    return rows.filter((row) => row.monitorId.toLowerCase().includes(needle));
  }, [rows, searchMonitorId]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Identity Collision Panel</h2>
          <p className="mt-1 text-sm text-slate-400">Monitor to patient mapping view from /api/v1/patients.</p>
        </div>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-2 text-xs"
          disabled={refreshing || loading}
          onClick={() => {
            void refreshData(false);
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <label className="grid gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search monitor_id</span>
          <input
            className="input-dark rounded-xl px-3 py-2 text-sm"
            placeholder="Type monitor_id"
            value={searchMonitorId}
            onChange={(event) => setSearchMonitorId(event.target.value)}
          />
        </label>

        <p className="text-xs text-slate-500">
          Auto refresh every 5s{lastSyncedAt ? ` | Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}
        </p>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-full text-left text-sm text-slate-300">
          <thead className="bg-black/25 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-3">monitor_id</th>
              <th className="px-3 py-3">patient_id</th>
              <th className="px-3 py-3">resolution_strategy</th>
              <th className="px-3 py-3">timestamp</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={4}>
                  Loading identity mappings...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-slate-400" colSpan={4}>
                  No mapping rows found for current filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={`${row.monitorId}-${row.patientId}-${row.timestampMs}`} className="border-t border-white/10">
                  <td className="px-3 py-3 font-mono text-xs text-cyan-300">{row.monitorId}</td>
                  <td className="px-3 py-3 font-semibold text-slate-100">{row.patientId}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${strategyBadgeClass(row.resolutionStrategy)}`}>
                      {row.resolutionStrategy}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-400">{row.timestampLabel}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
