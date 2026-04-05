"use client";

import { useMemo } from "react";
import { TimelineEvent } from "@/lib/api";

type AlertSeverity = "CRITICAL" | "WARNING";

type AlertFeedPanelProps = {
  events: TimelineEvent[];
  maxItems?: number;
};

function inferAlertSeverity(event: TimelineEvent): AlertSeverity {
  const riskLevel = String(event.riskLevel || "").toUpperCase();
  const alertType = String(event.alertType || "").toLowerCase();
  const message = String(event.message || "").toLowerCase();

  if (riskLevel === "WARNING" || alertType.includes("warning") || message.includes("warning")) {
    return "WARNING";
  }

  return "CRITICAL";
}

function badgeClass(severity: AlertSeverity): string {
  if (severity === "WARNING") {
    return "border-amber-500/45 bg-amber-500/15 text-amber-300";
  }

  return "border-rose-500/45 bg-rose-500/15 text-rose-300";
}

function cardClass(severity: AlertSeverity): string {
  if (severity === "WARNING") {
    return "border-amber-500/30 bg-amber-500/[0.07]";
  }

  return "border-rose-500/30 bg-rose-500/[0.08]";
}

export default function AlertFeedPanel({ events, maxItems = 20 }: AlertFeedPanelProps) {
  const alertEvents = useMemo(
    () =>
      [...events]
        .filter((event) => event.eventType === "alert")
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
        .slice(0, maxItems),
    [events, maxItems]
  );

  return (
    <aside className="surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Alert Feed</h2>
          <p className="mt-1 text-sm text-slate-400">Live stream of alert events from active telemetry ingestion.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
          {alertEvents.length} alerts
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {alertEvents.length === 0 ? (
          <p className="feature-card p-4 text-sm muted">No alert events available yet.</p>
        ) : (
          alertEvents.map((event) => {
            const severity = inferAlertSeverity(event);
            return (
              <article key={event.id} className={`rounded-xl border p-3 ${cardClass(severity)}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">Patient {event.patientId}</p>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${badgeClass(severity)}`}>
                    {severity}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-300">{event.message || "Critical condition detected. Immediate review required."}</p>

                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>{new Date(event.occurredAt).toLocaleString()}</span>
                  <span>{event.delivered ? "DELIVERED" : "PENDING"}</span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </aside>
  );
}
