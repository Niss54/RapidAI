"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchVoiceToken, LiveKitTokenResponse } from "@/lib/api";

type LiveKitConnectionState = "CONNECTED" | "DISCONNECTED" | "TOKEN_EXPIRED";

type TokenSnapshot = {
  roomName: string;
  identity: string;
  wsUrl: string;
  expiresAtMs: number | null;
};

const POLL_INTERVAL_MS = 5000;

function decodeBase64Url(value: string): string {
  const normalized = String(value || "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  return atob(padded);
}

function parseTokenExpiryMs(token: string): number | null {
  const tokenText = String(token || "").trim();
  if (!tokenText.includes(".")) {
    return null;
  }

  try {
    const parts = tokenText.split(".");
    if (parts.length < 2) {
      return null;
    }

    const payloadText = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadText) as { exp?: number };
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp) || exp <= 0) {
      return null;
    }

    return Math.round(exp * 1000);
  } catch {
    return null;
  }
}

function toTokenSnapshot(response: LiveKitTokenResponse): TokenSnapshot {
  return {
    roomName: String(response.roomName || "").trim(),
    identity: String(response.identity || "").trim(),
    wsUrl: String(response.wsUrl || "").trim(),
    expiresAtMs: parseTokenExpiryMs(response.token),
  };
}

function statusBadgeClass(status: LiveKitConnectionState): string {
  if (status === "CONNECTED") {
    return "border-emerald-500/45 bg-emerald-500/15 text-emerald-300";
  }

  if (status === "TOKEN_EXPIRED") {
    return "border-amber-500/45 bg-amber-500/15 text-amber-300";
  }

  return "border-rose-500/45 bg-rose-500/15 text-rose-300";
}

function statusLabel(status: LiveKitConnectionState): string {
  if (status === "CONNECTED") {
    return "Connected";
  }

  if (status === "TOKEN_EXPIRED") {
    return "Token Expired";
  }

  return "Disconnected";
}

function formatExpiry(expiresAtMs: number | null): string {
  if (!expiresAtMs || !Number.isFinite(expiresAtMs)) {
    return "unknown";
  }

  return new Date(expiresAtMs).toLocaleString();
}

export default function LiveKitStatusIndicator() {
  const [tokenSnapshot, setTokenSnapshot] = useState<TokenSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastCheckOk, setLastCheckOk] = useState(false);
  const [error, setError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const refreshStatus = useCallback(async (showLoadingState: boolean) => {
    if (showLoadingState) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const response = await fetchVoiceToken();
      setTokenSnapshot(toTokenSnapshot(response));
      setLastCheckOk(true);
      setError("");
      setLastCheckedAt(new Date().toISOString());
    } catch (requestError) {
      setLastCheckOk(false);
      setError(requestError instanceof Error ? requestError.message : "Voice token check failed");
      setLastCheckedAt(new Date().toISOString());
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

  const roomActive = useMemo(() => {
    return Boolean(tokenSnapshot?.roomName && tokenSnapshot?.wsUrl);
  }, [tokenSnapshot]);

  const tokenValid = useMemo(() => {
    if (!tokenSnapshot) {
      return false;
    }

    if (!tokenSnapshot.expiresAtMs) {
      return true;
    }

    return tokenSnapshot.expiresAtMs > Date.now();
  }, [tokenSnapshot]);

  const connectionState: LiveKitConnectionState = useMemo(() => {
    if (!lastCheckOk) {
      return "DISCONNECTED";
    }

    if (!tokenValid) {
      return "TOKEN_EXPIRED";
    }

    if (roomActive) {
      return "CONNECTED";
    }

    return "DISCONNECTED";
  }, [lastCheckOk, tokenValid, roomActive]);

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">LiveKit Status Indicator</h2>
          <p className="mt-1 text-sm text-slate-400">Polling /voice/token to track room activity and token validity.</p>
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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass(connectionState)}`}>
          {statusLabel(connectionState)}
        </span>

        <p className="text-xs text-slate-500">
          Update every {POLL_INTERVAL_MS / 1000}s
          {lastCheckedAt ? ` | Last check: ${new Date(lastCheckedAt).toLocaleTimeString()}` : ""}
        </p>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-2">
        <p>
          room active: <span className="font-semibold text-slate-100">{roomActive ? "yes" : "no"}</span>
        </p>
        <p>
          token valid: <span className="font-semibold text-slate-100">{tokenValid ? "yes" : "no"}</span>
        </p>
        <p className="md:col-span-2">
          room: <span className="font-semibold text-slate-100">{tokenSnapshot?.roomName || "-"}</span>
        </p>
        <p>
          identity: <span className="font-semibold text-slate-100">{tokenSnapshot?.identity || "-"}</span>
        </p>
        <p>
          expires: <span className="font-semibold text-slate-100">{formatExpiry(tokenSnapshot?.expiresAtMs || null)}</span>
        </p>
      </div>
    </section>
  );
}
