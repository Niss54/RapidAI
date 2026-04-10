export type TelemetryDebugEntry = {
  id: string;
  patientId: string;
  rawHexPayload: string;
  decodedHeartRate: number;
  decodedSpo2: number;
  decodedTemperature: number;
  decodedBloodPressure: string;
  source: string;
  monitorId: string;
  warnings: string[];
  createdAt: string;
};

type TelemetryDebugPanelProps = {
  entries: TelemetryDebugEntry[];
};

export default function TelemetryDebugPanel({ entries }: TelemetryDebugPanelProps) {
  return (
    <section className="surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Telemetry Debug Panel</h2>
          <p className="mt-1 text-sm text-slate-400">Hex input vs backend-decoded vitals from /telemetry/update.</p>
        </div>
        <span className="rounded-full border border-white/15 bg-white/[0.03] px-3 py-1 text-xs text-slate-300">
          {entries.length} traces
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="feature-card p-4 text-sm muted">No decoded telemetry yet. Submit a hex payload to inspect decoder output.</p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className="feature-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">Patient {entry.patientId}</p>
                <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>

              <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Raw Hex Payload</p>
                <p className="mt-1 break-all font-mono text-xs text-cyan-300">{entry.rawHexPayload}</p>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
                <p>
                  HR: <span className="font-semibold text-slate-100">{entry.decodedHeartRate}</span>
                </p>
                <p>
                  SpO2: <span className="font-semibold text-slate-100">{entry.decodedSpo2}</span>
                </p>
                <p>
                  Temp: <span className="font-semibold text-slate-100">{entry.decodedTemperature}</span>
                </p>
                <p>
                  BP: <span className="font-semibold text-slate-100">{entry.decodedBloodPressure}</span>
                </p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full border border-white/10 px-2 py-1">source: {entry.source}</span>
                <span className="rounded-full border border-white/10 px-2 py-1">monitor: {entry.monitorId}</span>
                {entry.warnings.length > 0 ? (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">
                    warnings: {entry.warnings.join(" | ")}
                  </span>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
