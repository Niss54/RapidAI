"use client";

import { useEffect, useState } from "react";
import {
  fetchSimulatorStatus,
  startBackendSimulation,
  stopBackendSimulation,
  SimulatorControlResponse,
} from "@/lib/api";

type SimulatorUiStatus = "Running" | "Stopped";

function statusBadgeClass(status: SimulatorUiStatus): string {
  if (status === "Running") {
    return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
  }

  return "border-slate-500/40 bg-slate-500/12 text-slate-300";
}

function toUiStatus(response: SimulatorControlResponse | null): SimulatorUiStatus {
  if (!response) {
    return "Stopped";
  }

  return response.running ? "Running" : "Stopped";
}

export default function SimulatorToggle() {
  const [status, setStatus] = useState<SimulatorUiStatus>("Stopped");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [submitting, setSubmitting] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState("");
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    let active = true;

    const loadStatus = async () => {
      try {
        const response = await fetchSimulatorStatus();
        if (!active) {
          return;
        }

        setStatus(toUiStatus(response));
        setLastError(response.lastError || "");
        setError("");
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Could not fetch simulator status");
      } finally {
        if (active) {
          setLoadingStatus(false);
        }
      }
    };

    void loadStatus();

    return () => {
      active = false;
    };
  }, []);

  async function handleStart() {
    setSubmitting("start");
    setError("");

    try {
      const response = await startBackendSimulation();
      setStatus(toUiStatus(response));
      setLastError(response.lastError || "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not start simulator");
    } finally {
      setSubmitting(null);
    }
  }

  async function handleStop() {
    setSubmitting("stop");
    setError("");

    try {
      const response = await stopBackendSimulation();
      setStatus(toUiStatus(response));
      setLastError(response.lastError || "");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not stop simulator");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Simulator Control</h3>
          <p className="mt-1 text-xs text-slate-400">Start or stop backend telemetry simulator.</p>
        </div>

        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(status)}`}>
          {loadingStatus ? "Loading..." : status}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-base btn-green px-3 py-2 text-xs"
          disabled={loadingStatus || submitting !== null || status === "Running"}
          onClick={() => {
            void handleStart();
          }}
        >
          {submitting === "start" ? "Starting..." : "Start Simulation"}
        </button>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-2 text-xs"
          disabled={loadingStatus || submitting !== null || status === "Stopped"}
          onClick={() => {
            void handleStop();
          }}
        >
          {submitting === "stop" ? "Stopping..." : "Stop Simulation"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-2 text-xs text-rose-300">{error}</p>
      ) : null}

      {lastError ? (
        <p className="mt-2 text-[11px] text-amber-300">Simulator last error: {lastError}</p>
      ) : null}
    </section>
  );
}
