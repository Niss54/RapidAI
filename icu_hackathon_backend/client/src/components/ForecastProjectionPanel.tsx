import { ForecastProjectionRecord } from "@/lib/api";

type ForecastProjectionPanelProps = {
  projections: ForecastProjectionRecord[];
  loading: boolean;
  error: string;
  filterPatientIds: string;
  filterFrom: string;
  filterTo: string;
  onFilterPatientIdsChange: (value: string) => void;
  onFilterFromChange: (value: string) => void;
  onFilterToChange: (value: string) => void;
  onApplyDatePreset: (hours: number) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  exportingFormat: "csv" | "json" | null;
};

function stateBadgeClass(state: string): string {
  const normalized = String(state || "").toUpperCase();
  if (normalized === "CRITICAL") {
    return "border-rose-500/45 bg-rose-500/15 text-rose-300";
  }
  if (normalized === "MODERATE") {
    return "border-amber-500/45 bg-amber-500/15 text-amber-300";
  }
  if (normalized === "WARNING") {
    return "border-orange-500/45 bg-orange-500/15 text-orange-300";
  }
  return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
}

function sourceBadgeClass(source: string): string {
  const normalized = String(source || "").toLowerCase();
  if (normalized === "legacy-ml") {
    return "border-cyan-500/40 bg-cyan-500/10 text-cyan-300";
  }
  if (normalized === "disabled") {
    return "border-slate-500/40 bg-slate-500/10 text-slate-300";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-300";
}

export default function ForecastProjectionPanel({
  projections,
  loading,
  error,
  filterPatientIds,
  filterFrom,
  filterTo,
  onFilterPatientIdsChange,
  onFilterFromChange,
  onFilterToChange,
  onApplyDatePreset,
  onClearFilters,
  onRefresh,
  onExportCsv,
  onExportJson,
  exportingFormat,
}: ForecastProjectionPanelProps) {
  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Forecast Projection Panel</h2>
          <p className="mt-1 text-sm text-slate-400">
            Live 5-10 minute forecast visualization from backend projection route.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-base btn-ghost px-4 py-2 text-sm" onClick={onRefresh} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Forecast"}
          </button>
          <button
            type="button"
            className="btn-base btn-ghost px-3 py-2 text-xs"
            onClick={onExportCsv}
            disabled={exportingFormat !== null}
          >
            {exportingFormat === "csv" ? "Exporting CSV..." : "Export CSV"}
          </button>
          <button
            type="button"
            className="btn-base btn-ghost px-3 py-2 text-xs"
            onClick={onExportJson}
            disabled={exportingFormat !== null}
          >
            {exportingFormat === "json" ? "Exporting JSON..." : "Export JSON"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <input
          className="input-dark rounded-lg px-3 py-2 text-xs"
          placeholder="Patient IDs (comma separated)"
          value={filterPatientIds}
          onChange={(event) => onFilterPatientIdsChange(event.target.value)}
        />
        <input
          type="datetime-local"
          className="input-dark rounded-lg px-3 py-2 text-xs"
          value={filterFrom}
          onChange={(event) => onFilterFromChange(event.target.value)}
        />
        <input
          type="datetime-local"
          className="input-dark rounded-lg px-3 py-2 text-xs"
          value={filterTo}
          onChange={(event) => onFilterToChange(event.target.value)}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-base btn-ghost px-3 py-1.5 text-[11px]"
          onClick={() => onApplyDatePreset(1)}
        >
          Last 1h
        </button>
        <button
          type="button"
          className="btn-base btn-ghost px-3 py-1.5 text-[11px]"
          onClick={() => onApplyDatePreset(6)}
        >
          Last 6h
        </button>
        <button
          type="button"
          className="btn-base btn-ghost px-3 py-1.5 text-[11px]"
          onClick={() => onApplyDatePreset(24)}
        >
          Last 24h
        </button>
        <button
          type="button"
          className="btn-base btn-ghost px-3 py-1.5 text-[11px]"
          onClick={onClearFilters}
        >
          Clear Filters
        </button>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Filters apply to both refresh and export requests. Date range filters compare against patient last-updated time.
      </p>

      {error ? <p className="mt-3 rounded-lg border border-amber-500/40 bg-amber-900/20 p-3 text-xs text-amber-200">{error}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projections.length === 0 ? (
          <p className="feature-card p-4 text-sm muted md:col-span-2 xl:col-span-3">
            No projection records available. Push telemetry to generate patient forecast traces.
          </p>
        ) : (
          projections.map((projection) => (
            <article key={projection.patientId} className="feature-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-slate-100">Patient {projection.patientId}</p>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${stateBadgeClass(projection.predictedDeteriorationState)}`}>
                  {projection.predictedDeteriorationState}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="text-xs text-slate-500">Current Risk</p>
                  <p className="mt-1 text-xl font-semibold text-violet-300">{projection.currentRiskScore}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <p className="text-xs text-slate-500">Future Risk</p>
                  <p className="mt-1 text-xl font-semibold text-cyan-300">{projection.futureRiskScore}</p>
                </div>
              </div>

              <div className="mt-3">
                <p className="mb-2 text-xs uppercase tracking-[0.16em] text-slate-500">Timeline Projection</p>
                <div className="grid grid-cols-3 gap-2">
                  {projection.timelineProjection.map((point) => (
                    <div key={`${projection.patientId}-${point.minute}`} className="rounded-lg border border-white/10 bg-black/20 p-2 text-center">
                      <p className="text-[11px] text-slate-500">+{point.minute}m</p>
                      <p className="mt-1 text-sm font-semibold text-slate-100">{point.riskScore}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-rose-400"
                    style={{ width: `${Math.max(0, Math.min(100, projection.futureRiskScore))}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between gap-2 text-[11px]">
                <span className={`rounded-full border px-2 py-1 ${sourceBadgeClass(projection.source)}`}>{projection.source}</span>
                {projection.warning ? <span className="text-amber-300">warning</span> : <span className="text-emerald-300">ok</span>}
              </div>

              {projection.patientLastUpdated ? (
                <p className="mt-2 text-[11px] text-slate-500">
                  Updated: {new Date(projection.patientLastUpdated).toLocaleString()}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
