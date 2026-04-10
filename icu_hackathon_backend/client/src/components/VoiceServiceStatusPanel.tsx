"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchVoiceAlertState,
  fetchVoiceLanguages,
  fetchVoiceToken,
  LiveKitTokenResponse,
  VoiceAlertStateResponse,
  VoiceLanguage,
  VoiceLanguagesResponse,
} from "@/lib/api";

const POLL_INTERVAL_MS = 5000;

const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  en: "English",
  hi: "Hindi",
  bn: "Bengali",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  ur: "Urdu",
  or: "Odia",
};

type TokenSnapshot = {
  roomName: string;
  identity: string;
  wsUrl: string;
  tokenPreview: string;
  createdAt: string;
};

function toLanguageLabel(code: string | null | undefined): string {
  const normalized = String(code || "").trim().toLowerCase() as VoiceLanguage;
  return LANGUAGE_LABELS[normalized] || String(code || "Unknown").toUpperCase();
}

function toDurationLabel(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }

  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function toTokenPreview(token: string): string {
  const trimmed = String(token || "").trim();
  if (trimmed.length <= 32) {
    return trimmed;
  }

  return `${trimmed.slice(0, 18)}...${trimmed.slice(-12)}`;
}

function normalizeTokenSnapshot(response: LiveKitTokenResponse): TokenSnapshot {
  return {
    roomName: String(response.roomName || "-").trim(),
    identity: String(response.identity || "-").trim(),
    wsUrl: String(response.wsUrl || "-").trim(),
    tokenPreview: toTokenPreview(response.token),
    createdAt: new Date().toISOString(),
  };
}

export default function VoiceServiceStatusPanel() {
  const [languages, setLanguages] = useState<VoiceLanguagesResponse | null>(null);
  const [alertState, setAlertState] = useState<VoiceAlertStateResponse>({ active: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const [tokenSnapshot, setTokenSnapshot] = useState<TokenSnapshot | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState("");

  const refreshVoiceState = useCallback(async () => {
    try {
      const [languagesResponse, alertResponse] = await Promise.all([
        fetchVoiceLanguages(),
        fetchVoiceAlertState(),
      ]);

      setLanguages(languagesResponse);
      setAlertState(alertResponse);
      setLastSyncedAt(new Date().toISOString());
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not fetch voice service status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const run = async () => {
      if (!active) {
        return;
      }

      await refreshVoiceState();
    };

    void run();
    interval = setInterval(() => {
      void run();
    }, POLL_INTERVAL_MS);

    return () => {
      active = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [refreshVoiceState]);

  const fetchTokenSnapshot = useCallback(async () => {
    setTokenLoading(true);
    setTokenError("");

    try {
      const tokenResponse = await fetchVoiceToken();
      setTokenSnapshot(normalizeTokenSnapshot(tokenResponse));
    } catch (requestError) {
      setTokenError(requestError instanceof Error ? requestError.message : "Could not fetch voice token");
    } finally {
      setTokenLoading(false);
    }
  }, []);

  const supportedLanguages = languages?.supportedLanguages ?? [];

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Voice Service Status</h2>
          <p className="mt-1 text-sm text-slate-400">
            Live integration for /voice/languages, /voice/alert-state, and /voice/token endpoints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-base btn-ghost px-3 py-1.5 text-xs"
            onClick={() => {
              void refreshVoiceState();
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn-base btn-main px-3 py-1.5 text-xs"
            disabled={tokenLoading}
            onClick={() => {
              void fetchTokenSnapshot();
            }}
          >
            {tokenLoading ? "Requesting token..." : "Generate Voice Token"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-xs text-rose-300">{error}</p>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <article className="feature-card p-4">
          <p className="kicker">Active Language</p>
          <p className="mt-2 text-lg font-semibold text-slate-100">
            {languages ? toLanguageLabel(languages.activeLanguage) : loading ? "Loading..." : "Unknown"}
          </p>
        </article>

        <article className="feature-card p-4">
          <p className="kicker">Supported Languages</p>
          <p className="mt-2 text-lg font-semibold text-cyan-300">{supportedLanguages.length}</p>
        </article>

        <article className="feature-card p-4">
          <p className="kicker">Alert Mode</p>
          <p className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${alertState.active ? "border-rose-500/35 bg-rose-500/15 text-rose-300" : "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"}`}>
            {alertState.active ? "ACTIVE" : "IDLE"}
          </p>
          {alertState.active ? (
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              <p>Patient: {alertState.patientId || "-"}</p>
              <p>Language: {toLanguageLabel(alertState.language)}</p>
              <p>Remaining: {toDurationLabel(alertState.remainingMs)}</p>
              <p>Message: {alertState.message || "-"}</p>
            </div>
          ) : null}
        </article>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {supportedLanguages.length === 0 ? (
          <p className="text-xs text-slate-500">No language metadata available.</p>
        ) : (
          supportedLanguages.map((languageCode) => (
            <span
              key={languageCode}
              className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200"
            >
              {toLanguageLabel(languageCode)}
            </span>
          ))
        )}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-100">Voice Token Diagnostics</p>
          {lastSyncedAt ? <p className="text-xs text-slate-500">Synced: {new Date(lastSyncedAt).toLocaleTimeString()}</p> : null}
        </div>

        {tokenError ? (
          <p className="mt-2 rounded-md border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-xs text-rose-300">{tokenError}</p>
        ) : null}

        {tokenSnapshot ? (
          <div className="mt-2 grid gap-2 text-xs text-slate-300 md:grid-cols-2">
            <p>
              Room: <span className="font-semibold text-slate-100">{tokenSnapshot.roomName}</span>
            </p>
            <p>
              Identity: <span className="font-semibold text-slate-100">{tokenSnapshot.identity}</span>
            </p>
            <p className="md:col-span-2 break-all">
              WS URL: <span className="font-semibold text-slate-100">{tokenSnapshot.wsUrl}</span>
            </p>
            <p className="md:col-span-2 break-all">
              Token: <span className="font-semibold text-slate-100">{tokenSnapshot.tokenPreview}</span>
            </p>
            <p className="text-[11px] text-slate-500 md:col-span-2">Generated at {new Date(tokenSnapshot.createdAt).toLocaleString()}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Generate a token to verify /voice/token integration and LiveKit credentials.</p>
        )}
      </div>
    </section>
  );
}
