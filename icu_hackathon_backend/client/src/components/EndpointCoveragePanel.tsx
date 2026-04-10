type EndpointCoverageRow = {
  method: "GET" | "POST";
  path: string;
  status: "Connected" | "Missing";
  uiSurface: string;
};

const COVERAGE_ROWS: EndpointCoverageRow[] = [
  { method: "GET", path: "/health", status: "Connected", uiSurface: "Dashboard service tracker" },
  { method: "GET", path: "/icu/summary", status: "Connected", uiSurface: "Patient Snapshot cards" },
  { method: "GET", path: "/icu/timeline", status: "Connected", uiSurface: "Recent Timeline + Alert Feed" },
  { method: "GET", path: "/icu/forecast/projection", status: "Connected", uiSurface: "Forecast Projection panel" },
  { method: "GET", path: "/icu/forecast/projection/export", status: "Connected", uiSurface: "Forecast CSV/JSON export controls" },
  { method: "POST", path: "/telemetry/update", status: "Connected", uiSurface: "Push Telemetry + evaluation flows" },
  { method: "POST", path: "/voice/query", status: "Connected", uiSurface: "Voice Assistant panel + Chat page" },
  { method: "GET", path: "/voice/token", status: "Connected", uiSurface: "Voice Service Status token diagnostics" },
  { method: "GET", path: "/voice/languages", status: "Connected", uiSurface: "Voice Service Status language metadata" },
  { method: "GET", path: "/voice/alert-state", status: "Connected", uiSurface: "Voice Service Status alert mode" },
];

function methodBadgeClass(method: "GET" | "POST"): string {
  return method === "GET"
    ? "border-cyan-500/35 bg-cyan-500/12 text-cyan-200"
    : "border-emerald-500/35 bg-emerald-500/12 text-emerald-200";
}

function statusBadgeClass(status: "Connected" | "Missing"): string {
  return status === "Connected"
    ? "border-emerald-500/35 bg-emerald-500/12 text-emerald-300"
    : "border-rose-500/35 bg-rose-500/12 text-rose-300";
}

export default function EndpointCoveragePanel() {
  const connectedCount = COVERAGE_ROWS.filter((row) => row.status === "Connected").length;

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Endpoint Coverage</h2>
          <p className="mt-1 text-sm text-slate-400">
            Backend route-to-UI integration map for dashboard and voice surfaces.
          </p>
        </div>

        <span className="rounded-full border border-emerald-500/35 bg-emerald-500/12 px-3 py-1 text-xs font-semibold text-emerald-300">
          {connectedCount}/{COVERAGE_ROWS.length} connected
        </span>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <table className="min-w-full border-collapse text-left text-xs text-slate-300">
          <thead>
            <tr className="border-b border-white/10 text-[11px] uppercase tracking-[0.16em] text-slate-500">
              <th className="px-3 py-2 font-semibold">Method</th>
              <th className="px-3 py-2 font-semibold">Path</th>
              <th className="px-3 py-2 font-semibold">Status</th>
              <th className="px-3 py-2 font-semibold">UI Surface</th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE_ROWS.map((row) => (
              <tr key={`${row.method}-${row.path}`} className="border-b border-white/5 last:border-b-0">
                <td className="px-3 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${methodBadgeClass(row.method)}`}>
                    {row.method}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-200">{row.path}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-300">{row.uiSurface}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
