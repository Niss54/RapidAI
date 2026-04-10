"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchVoiceLogs, VoiceLogRecord } from "@/lib/api";

const PAGE_SIZE = 10;
const AUTO_REFRESH_MS = 3000;

function toTimestampMs(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value: string): string {
  const ms = toTimestampMs(value);
  if (ms <= 0) {
    return "-";
  }

  return new Date(ms).toLocaleString();
}

export default function VoiceLogsPanel() {
  const [logs, setLogs] = useState<VoiceLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [languageFilter, setLanguageFilter] = useState("all");
  const [intentFilter, setIntentFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const refreshLogs = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetchVoiceLogs({
        language: languageFilter === "all" ? "" : languageFilter,
        intent: intentFilter === "all" ? "" : intentFilter,
        page,
        limit: PAGE_SIZE,
      });

      setLogs(Array.isArray(response.logs) ? response.logs : []);
      setTotal(Number(response.total) || 0);
      setError("");
      setLastSyncedAt(new Date().toISOString());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load voice logs");
    } finally {
      if (showLoadingState) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  }, [languageFilter, intentFilter, page]);

  useEffect(() => {
    let active = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const run = async (showLoadingState: boolean) => {
      if (!active) {
        return;
      }

      await refreshLogs(showLoadingState);
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
  }, [refreshLogs]);

  useEffect(() => {
    setPage(1);
  }, [languageFilter, intentFilter]);

  const totalPages = useMemo(() => {
    const pages = Math.ceil(total / PAGE_SIZE);
    return Math.max(1, pages);
  }, [total]);

  useEffect(() => {
    if (page <= totalPages) {
      return;
    }

    setPage(totalPages);
  }, [page, totalPages]);

  const sortedLogs = useMemo(() => {
    return [...logs].sort((a, b) => toTimestampMs(b.timestamp) - toTimestampMs(a.timestamp));
  }, [logs]);

  const languageOptions = useMemo(() => {
    const options = new Set<string>();
    for (const row of logs) {
      const language = String(row.language || "").trim().toLowerCase();
      if (language) {
        options.add(language);
      }
    }

    if (languageFilter !== "all") {
      options.add(languageFilter);
    }

    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [logs, languageFilter]);

  const intentOptions = useMemo(() => {
    const options = new Set<string>();
    for (const row of logs) {
      const intent = String(row.detected_intent || "").trim();
      if (intent) {
        options.add(intent);
      }
    }

    if (intentFilter !== "all") {
      options.add(intentFilter);
    }

    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [logs, intentFilter]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Voice Logs Panel</h2>
          <p className="mt-1 text-sm text-slate-400">Supabase voice_interactions logs with filters and paginated latest-first view.</p>
        </div>

        <button
          type="button"
          className="btn-base btn-ghost px-3 py-2 text-xs"
          disabled={loading || refreshing}
          onClick={() => {
            void refreshLogs(false);
          }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-500" htmlFor="voice-log-language-filter">
          language
        </label>
        <select
          id="voice-log-language-filter"
          className="input-dark rounded-lg px-3 py-2 text-xs"
          value={languageFilter}
          onChange={(event) => setLanguageFilter(event.target.value)}
        >
          <option value="all">all</option>
          {languageOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <label className="text-xs text-slate-500" htmlFor="voice-log-intent-filter">
          intent
        </label>
        <select
          id="voice-log-intent-filter"
          className="input-dark rounded-lg px-3 py-2 text-xs"
          value={intentFilter}
          onChange={(event) => setIntentFilter(event.target.value)}
        >
          <option value="all">all</option>
          {intentOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <p className="ml-auto text-xs text-slate-500">
          Auto refresh: {AUTO_REFRESH_MS} ms
          {lastSyncedAt ? ` | Last sync: ${new Date(lastSyncedAt).toLocaleTimeString()}` : ""}
        </p>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-sm text-rose-300">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20">
        <table className="min-w-full text-left text-sm text-slate-300">
          <thead className="bg-black/25 text-xs uppercase tracking-[0.12em] text-slate-500">
            <tr>
              <th className="px-3 py-3">query_text</th>
              <th className="px-3 py-3">detected_intent</th>
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
            ) : sortedLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-slate-400">
                  No voice interactions found for selected filters.
                </td>
              </tr>
            ) : (
              sortedLogs.map((row) => (
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

      <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
        <p>
          Page {page} of {totalPages} | {total} rows
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-base btn-ghost px-2.5 py-1"
            disabled={page <= 1}
            onClick={() => setPage((previous) => Math.max(1, previous - 1))}
          >
            Prev
          </button>
          <button
            type="button"
            className="btn-base btn-ghost px-2.5 py-1"
            disabled={page >= totalPages}
            onClick={() => setPage((previous) => Math.min(totalPages, previous + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
