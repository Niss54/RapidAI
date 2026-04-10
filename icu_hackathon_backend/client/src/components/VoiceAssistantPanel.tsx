"use client";

import { useState } from "react";
import { queryVoice, VoiceLanguage } from "@/lib/api";

type VoiceAssistantEntry = {
  id: string;
  query: string;
  transcript: string;
  responseText: string;
  intent: string;
  patientId: string | null;
  createdAt: string;
  mode: "text" | "voice";
};

const SAMPLE_QUERIES = [
  "status of patient 101",
  "who is critical",
  "summarize ICU alerts",
];

const LANGUAGE_OPTIONS: Array<{ code: VoiceLanguage; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "mr", label: "Marathi" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "ur", label: "Urdu" },
  { code: "or", label: "Odia" },
];

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function captureAudioBase64(durationMs = 4200): Promise<string | null> {
  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone API is not available in this browser.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  return new Promise((resolve, reject) => {
    try {
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      } catch {
        recorder = new MediaRecorder(stream);
      }

      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        stream.getTracks().forEach((track) => track.stop());
        reject(new Error("Voice recording failed"));
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: "audio/webm" });
          if (blob.size === 0) {
            resolve(null);
            return;
          }

          resolve(toBase64(await blob.arrayBuffer()));
        } catch {
          reject(new Error("Could not parse recorded audio"));
        } finally {
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, durationMs);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      reject(error instanceof Error ? error : new Error("Could not initialize recorder"));
    }
  });
}

export default function VoiceAssistantPanel() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<VoiceLanguage>("en");
  const [submitting, setSubmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<VoiceAssistantEntry[]>([]);

  const appendEntry = (entry: VoiceAssistantEntry) => {
    setEntries((previous) => [entry, ...previous].slice(0, 10));
  };

  const sendTextQuery = async (rawText: string) => {
    const text = String(rawText || "").trim();
    if (!text) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const result = await queryVoice({
        text,
        language,
        userId: "dashboard-voice-panel",
      });

      appendEntry({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        query: text,
        transcript: result.transcript || text,
        responseText: result.responseText,
        intent: result.intent,
        patientId: result.patientId,
        createdAt: new Date().toISOString(),
        mode: "text",
      });
      setQuery("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Voice query failed");
    } finally {
      setSubmitting(false);
    }
  };

  const sendVoiceQuery = async () => {
    setListening(true);
    setError("");

    try {
      const audioBase64 = await captureAudioBase64();
      if (!audioBase64) {
        setError("No voice input detected. Please try again.");
        return;
      }

      const result = await queryVoice({
        audioBase64,
        language,
        userId: "dashboard-voice-panel",
      });

      appendEntry({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        query: result.transcript || "Voice input",
        transcript: result.transcript || "Voice input",
        responseText: result.responseText,
        intent: result.intent,
        patientId: result.patientId,
        createdAt: new Date().toISOString(),
        mode: "voice",
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Voice query failed");
    } finally {
      setListening(false);
    }
  };

  return (
    <section className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Voice Assistant Panel</h2>
          <p className="mt-1 text-sm text-slate-400">
            Test /voice/query with text or microphone and review structured responses.
          </p>
        </div>

        <select
          className="input-dark rounded-lg px-3 py-2 text-sm"
          value={language}
          onChange={(event) => setLanguage(event.target.value as VoiceLanguage)}
        >
          {LANGUAGE_OPTIONS.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {SAMPLE_QUERIES.map((sample) => (
          <button
            key={sample}
            type="button"
            className="btn-base btn-ghost px-3 py-1.5 text-xs"
            disabled={submitting || listening}
            onClick={() => {
              void sendTextQuery(sample);
            }}
          >
            {sample}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          className="input-dark min-w-[220px] flex-1 rounded-lg px-3 py-2 text-sm"
          placeholder="Ask doctor query (e.g. status of patient 101)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void sendTextQuery(query);
            }
          }}
        />
        <button
          type="button"
          className="btn-base btn-main px-4 py-2 text-sm"
          disabled={submitting || listening}
          onClick={() => {
            void sendTextQuery(query);
          }}
        >
          {submitting ? "Sending..." : "Send"}
        </button>
        <button
          type="button"
          className="btn-base btn-green px-4 py-2 text-sm"
          disabled={submitting || listening}
          onClick={() => {
            void sendVoiceQuery();
          }}
        >
          {listening ? "Listening..." : "Microphone"}
        </button>
      </div>

      {error ? <p className="mt-3 rounded-lg border border-rose-500/35 bg-rose-900/20 p-3 text-xs text-rose-300">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="feature-card p-4 text-sm muted">
            No voice responses yet. Use sample queries or send your own doctor command.
          </p>
        ) : (
          entries.map((entry) => (
            <article key={entry.id} className="feature-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-100">
                  Query ({entry.mode}): <span className="text-slate-300">{entry.query}</span>
                </p>
                <p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
              </div>

              <p className="mt-2 text-sm text-slate-300">
                Intent: <span className="font-semibold text-cyan-300">{entry.intent}</span>
                {entry.patientId ? (
                  <>
                    {" "}
                    | Patient: <span className="font-semibold text-violet-300">{entry.patientId}</span>
                  </>
                ) : null}
              </p>

              <p className="mt-2 rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
                {entry.responseText}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
