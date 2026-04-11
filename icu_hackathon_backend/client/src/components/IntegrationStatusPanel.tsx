"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchIntegrationStatus,
  IntegrationStatusResponse,
  fetchWhatsAppIntegrationStatus,
  WhatsAppIntegrationStatusResponse,
} from "@/lib/api";

const POLL_INTERVAL_MS = 5000;

type WhatsAppMode = "connected" | "inactive" | "disabled";

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return "-";
  }

  return parsed.toLocaleString();
}

function normalizeStatus(value: string | null | undefined): "running" | "stopped" {
  return String(value || "").trim().toLowerCase() === "running"
    ? "running"
    : "stopped";
}

function computeWhatsAppMode(
  status: WhatsAppIntegrationStatusResponse | null,
  error: string
): WhatsAppMode {
  if (status) {
    const normalizedStatus = String(status.status || "").trim().toLowerCase();

    if (normalizedStatus === "active" && status.tokenConfigured && status.phoneNumberConfigured) {
      return "connected";
    }

    if (normalizedStatus === "inactive") {
      return "inactive";
    }
  }

  if (error) {
    return "disabled";
  }

  return "disabled";
}

function whatsappBadgeClass(isActive: boolean, variant: "emerald" | "amber" | "slate"): string {
  if (!isActive) {
    return "border-slate-700/60 bg-slate-900/35 text-slate-500";
  }

  if (variant === "emerald") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
  }

  if (variant === "amber") {
    return "border-amber-500/40 bg-amber-500/15 text-amber-300";
  }

  return "border-slate-500/40 bg-slate-500/15 text-slate-300";
}

export default function IntegrationStatusPanel() {
  const [status, setStatus] = useState<IntegrationStatusResponse | null>(null);
  const [whatsAppStatus, setWhatsAppStatus] = useState<WhatsAppIntegrationStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastPolledAt, setLastPolledAt] = useState<string | null>(null);

  const refreshStatus = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const [integrationResult, whatsappResult] = await Promise.allSettled([
        fetchIntegrationStatus(),
        fetchWhatsAppIntegrationStatus(),
      ]);

      const nextErrors: string[] = [];

      if (integrationResult.status === "fulfilled") {
        setStatus(integrationResult.value);
      } else {
        setStatus(null);
        nextErrors.push(
          integrationResult.reason instanceof Error
            ? `Integration status: ${integrationResult.reason.message}`
            : "Integration status: request failed"
        );
      }

      if (whatsappResult.status === "fulfilled") {
        setWhatsAppStatus(whatsappResult.value);
      } else {
        setWhatsAppStatus(null);
        nextErrors.push(
          whatsappResult.reason instanceof Error
            ? `WhatsApp status: ${whatsappResult.reason.message}`
            : "WhatsApp status: request failed"
        );
      }

      setError(nextErrors.join(" | "));
      setLastPolledAt(new Date().toISOString());
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

      await refreshStatus(showLoadingState);
    };

    void run(true);
    intervalId = setInterval(() => {
      void run(false);
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [refreshStatus]);

  const hl7Status = normalizeStatus(status?.hl7_listener);
  const serialStatus = normalizeStatus(status?.serial_bridge);
  const whatsappMode = useMemo(
    () => computeWhatsAppMode(whatsAppStatus, error),
    [whatsAppStatus, error]
  );
  const whatsappCredentialsSummary = useMemo(() => {
    if (!whatsAppStatus) {
      return "Credentials: unavailable";
    }

    if (String(whatsAppStatus.status || "").trim().toLowerCase() === "inactive") {
      return `Status: Inactive (${whatsAppStatus.reason || "credentials-missing"}) | Token ${
        whatsAppStatus.tokenConfigured ? "configured" : "missing"
      }, Phone Number ID ${whatsAppStatus.phoneNumberConfigured ? "configured" : "missing"}`;
    }

    return `Credentials: Token ${
      whatsAppStatus.tokenConfigured ? "configured" : "missing"
    }, Phone Number ID ${
      whatsAppStatus.phoneNumberConfigured ? "configured" : "missing"
    }`;
  }, [whatsAppStatus]);

  const whatsappCredentialsSummaryClass = useMemo(() => {
    if (!whatsAppStatus) {
      return "text-slate-500";
    }

    if (whatsAppStatus.tokenConfigured && whatsAppStatus.phoneNumberConfigured) {
      return "text-emerald-200";
    }

    return "text-amber-300";
  }, [whatsAppStatus]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Integration Status Panel</h2>
          <p className="mt-1 text-sm text-slate-400">
            Unified status from /integration/status and /integration/whatsapp-status.
          </p>
        </div>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-2 text-xs"
          disabled={loading || refreshing}
          onClick={() => {
            void refreshStatus(false);
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Ingestion Bridge</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                hl7Status === "running"
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-rose-500/40 bg-rose-500/15 text-rose-300"
              }`}
            >
              {hl7Status === "running" ? "HL7 Listener Running" : "HL7 Listener Stopped"}
            </span>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                serialStatus === "running"
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/15 text-amber-300"
              }`}
            >
              {serialStatus === "running"
                ? "Serial Bridge Connected"
                : "Serial Bridge Disconnected"}
            </span>
          </div>

          <p className="mt-2 text-xs text-cyan-200">
            Last Telemetry Timestamp: {formatTimestamp(status?.last_message_received || null)}
          </p>
        </article>

        <article className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">WhatsApp Escalation</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${whatsappBadgeClass(
                whatsappMode === "connected",
                "emerald"
              )}`}
            >
              WhatsApp Connected
            </span>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${whatsappBadgeClass(
                whatsappMode === "inactive",
                "amber"
              )}`}
            >
              Integration Inactive
            </span>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${whatsappBadgeClass(
                whatsappMode === "disabled",
                "slate"
              )}`}
            >
              Integration Disabled
            </span>
          </div>

          <p className={`mt-2 text-xs ${whatsappCredentialsSummaryClass}`}>
            {whatsappCredentialsSummary}
          </p>
        </article>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Auto refresh every {POLL_INTERVAL_MS / 1000} seconds
        {lastPolledAt
          ? ` | Last checked: ${new Date(lastPolledAt).toLocaleTimeString()}`
          : ""}
      </p>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
