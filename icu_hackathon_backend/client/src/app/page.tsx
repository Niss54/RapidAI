"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Room, RoomEvent } from "livekit-client";
import {
  IcuSummaryResponse,
  TimelineEvent,
  fetchIcuTimeline,
  fetchHealth,
  fetchIcuSummary,
  fetchVoiceToken,
  queryVoice,
  toDataUrl,
  updateTelemetry,
} from "@/lib/api";

type Language = "en" | "hi";

type TelemetryForm = {
  patientId: string;
  heartRate: string;
  spo2: string;
  temperature: string;
  bloodPressure: string;
};

const DEFAULT_FORM: TelemetryForm = {
  patientId: "204",
  heartRate: "112",
  spo2: "89",
  temperature: "99.5",
  bloodPressure: "124/84",
};

function riskClass(level: string): string {
  const normalized = level.toUpperCase();
  if (normalized === "CRITICAL") {
    return "bg-red-100 text-red-700 border-red-300";
  }
  if (normalized === "MODERATE") {
    return "bg-yellow-100 text-yellow-700 border-yellow-300";
  }
  if (normalized === "WARNING") {
    return "bg-orange-100 text-orange-700 border-orange-300";
  }
  return "bg-emerald-100 text-emerald-700 border-emerald-300";
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function playAudio(base64: string) {
  const audio = new Audio(toDataUrl(base64));
  void audio.play();
}

export default function Home() {
  const [health, setHealth] = useState<{ status: string; service: string } | null>(null);
  const [summaryData, setSummaryData] = useState<IcuSummaryResponse | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [form, setForm] = useState<TelemetryForm>(DEFAULT_FORM);
  const [language, setLanguage] = useState<Language>("en");
  const [voiceText, setVoiceText] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [voiceResponse, setVoiceResponse] = useState<string>("");
  const [lastIntent, setLastIntent] = useState<string>("");
  const [listening, setListening] = useState<boolean>(false);
  const [joiningRoom, setJoiningRoom] = useState<boolean>(false);
  const [roomConnected, setRoomConnected] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const roomRef = useRef<Room | null>(null);

  function timelineBadgeClass(event: TimelineEvent): string {
    if (event.eventType === "alert") {
      return event.delivered
        ? "bg-red-100 text-red-700 border-red-300"
        : "bg-slate-100 text-slate-700 border-slate-300";
    }

    const risk = String(event.riskLevel || "STABLE").toUpperCase();
    if (risk === "CRITICAL") {
      return "bg-red-100 text-red-700 border-red-300";
    }
    if (risk === "MODERATE") {
      return "bg-yellow-100 text-yellow-700 border-yellow-300";
    }
    if (risk === "WARNING") {
      return "bg-orange-100 text-orange-700 border-orange-300";
    }
    return "bg-emerald-100 text-emerald-700 border-emerald-300";
  }

  const refreshSummary = useCallback(async () => {
    const [healthData, summary, timeline] = await Promise.all([
      fetchHealth(),
      fetchIcuSummary(),
      fetchIcuTimeline({ limit: 40 }),
    ]);
    setHealth(healthData);
    setSummaryData(summary);
    setTimelineEvents(timeline.events || []);
  }, []);

  useEffect(() => {
    void refreshSummary().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    });

    const timer = setInterval(() => {
      void refreshSummary().catch(() => undefined);
    }, 8000);

    return () => {
      clearInterval(timer);
      if (roomRef.current) {
        void roomRef.current.disconnect();
      }
    };
  }, [refreshSummary]);

  const ensureRoomConnected = useCallback(async () => {
    if (roomRef.current?.state === "connected") {
      setRoomConnected(true);
      return;
    }

    setJoiningRoom(true);
    try {
      const tokenInfo = await fetchVoiceToken();
      const room = new Room();

      room.on(RoomEvent.DataReceived, (payload) => {
        try {
          const text = new TextDecoder().decode(payload);
          const parsed = JSON.parse(text) as {
            type?: string;
            text?: string;
            language?: Language;
            audioBase64?: string;
          };

          if (parsed.text) {
            setVoiceResponse(parsed.text);
          }
          if (parsed.language) {
            setLanguage(parsed.language);
          }
          if (parsed.audioBase64) {
            playAudio(parsed.audioBase64);
          }
        } catch {
          // Ignore malformed payloads from room data channel.
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setRoomConnected(false);
      });

      await room.connect(tokenInfo.wsUrl, tokenInfo.token);
      roomRef.current = room;
      setRoomConnected(true);
    } finally {
      setJoiningRoom(false);
    }
  }, []);

  async function handleTelemetrySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      const result = await updateTelemetry({
        patientId: form.patientId,
        heartRate: Number(form.heartRate),
        spo2: Number(form.spo2),
        temperature: Number(form.temperature),
        bloodPressure: form.bloodPressure,
      });

      if (result.alert?.audioBase64) {
        playAudio(result.alert.audioBase64);
      }

      await refreshSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Telemetry update failed");
    }
  }

  async function submitTextCommand() {
    if (!voiceText.trim()) {
      return;
    }

    setError("");
    try {
      await ensureRoomConnected().catch(() => {
        setRoomConnected(false);
      });
      const result = await queryVoice({ text: voiceText, language });
      setTranscript(result.transcript);
      setLastIntent(result.intent);
      setVoiceResponse(result.responseText);
      setLanguage(result.language);
      if (result.audioBase64) {
        playAudio(result.audioBase64);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice command failed");
    }
  }

  async function startListening() {
    setError("");
    setListening(true);

    try {
      await ensureRoomConnected().catch(() => {
        setRoomConnected(false);
      });

      const room = roomRef.current;
      if (room) {
        await room.localParticipant.setMicrophoneEnabled(true);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: "audio/webm" });
          const base64 = arrayBufferToBase64(await blob.arrayBuffer());
          const result = await queryVoice({ audioBase64: base64, language });

          setTranscript(result.transcript);
          setLastIntent(result.intent);
          setVoiceResponse(result.responseText);
          setLanguage(result.language);
          if (result.audioBase64) {
            playAudio(result.audioBase64);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Voice recognition failed");
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          if (roomRef.current) {
            await roomRef.current.localParticipant.setMicrophoneEnabled(false);
          }
          setListening(false);
        }
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, 4500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start microphone");
      setListening(false);
    }
  }

  const patientCards = useMemo(() => summaryData?.patients ?? [], [summaryData]);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8">
      <section className="glass rounded-3xl p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan-700">ICU Voice Assistant</p>
            <h1 className="mt-2 text-3xl font-semibold md:text-5xl">Real-Time Early Warning + Voice Control</h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Telemetry Engine to Risk Analyzer to Voice Controller to LiveKit audio channel.
            </p>
          </div>
          <div className="rounded-2xl bg-white/70 p-4 text-sm">
            <p>
              Backend: <span className="font-semibold">{health?.service ?? "loading"}</span>
            </p>
            <p>
              Room: <span className="font-semibold">{roomConnected ? "connected" : "disconnected"}</span>
            </p>
            <button
              className="mt-3 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              onClick={() =>
                void ensureRoomConnected().catch((err) => {
                  setError(err instanceof Error ? err.message : "Could not join voice room");
                })
              }
              disabled={joiningRoom || roomConnected}
            >
              {joiningRoom ? "Joining..." : roomConnected ? "Room Connected" : "Join Voice Room"}
            </button>
          </div>
        </div>
      </section>

      {error ? <section className="glass rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">{error}</section> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="glass rounded-2xl p-5">
          <p className="font-mono text-xs uppercase text-slate-500">Critical</p>
          <p className="mt-2 text-4xl font-semibold text-red-600">{summaryData?.summary.critical ?? 0}</p>
        </article>
        <article className="glass rounded-2xl p-5">
          <p className="font-mono text-xs uppercase text-slate-500">Moderate</p>
          <p className="mt-2 text-4xl font-semibold text-yellow-600">{summaryData?.summary.moderate ?? 0}</p>
        </article>
        <article className="glass rounded-2xl p-5">
          <p className="font-mono text-xs uppercase text-slate-500">Warning</p>
          <p className="mt-2 text-4xl font-semibold text-orange-600">{summaryData?.summary.warning ?? 0}</p>
        </article>
        <article className="glass rounded-2xl p-5">
          <p className="font-mono text-xs uppercase text-slate-500">Stable</p>
          <p className="mt-2 text-4xl font-semibold text-emerald-600">{summaryData?.summary.stable ?? 0}</p>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <article className="glass rounded-2xl p-5">
          <h2 className="text-xl font-semibold">Telemetry Update</h2>
          <form className="mt-4 grid gap-3" onSubmit={(e) => void handleTelemetrySubmit(e)}>
            <input
              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm"
              value={form.patientId}
              onChange={(e) => setForm((s) => ({ ...s, patientId: e.target.value }))}
              placeholder="Patient ID"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm"
                value={form.heartRate}
                onChange={(e) => setForm((s) => ({ ...s, heartRate: e.target.value }))}
                placeholder="Heart Rate"
              />
              <input
                className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm"
                value={form.spo2}
                onChange={(e) => setForm((s) => ({ ...s, spo2: e.target.value }))}
                placeholder="SpO2"
              />
              <input
                className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm"
                value={form.temperature}
                onChange={(e) => setForm((s) => ({ ...s, temperature: e.target.value }))}
                placeholder="Temperature"
              />
            </div>
            <input
              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm"
              value={form.bloodPressure}
              onChange={(e) => setForm((s) => ({ ...s, bloodPressure: e.target.value }))}
              placeholder="Blood Pressure"
            />
            <button className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700" type="submit">
              Push Telemetry
            </button>
          </form>
        </article>

        <article className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Voice Assistant</h2>
            <select
              className="rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value === "hi" ? "hi" : "en")}
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </div>

          <div className="mt-4 grid gap-3">
            <textarea
              className="min-h-24 rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm"
              placeholder="Type: status of patient 204 / give ICU summary / switch language to Hindi"
              value={voiceText}
              onChange={(e) => setVoiceText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                onClick={() => void submitTextCommand()}
                type="button"
              >
                Ask by Text
              </button>
              <button
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                onClick={() => void startListening()}
                type="button"
                disabled={listening}
              >
                {listening ? "Listening..." : "Start Listening"}
              </button>
            </div>

            <div className="rounded-xl bg-white/75 p-3 text-sm">
              <p>
                <span className="font-semibold">Transcript:</span> {transcript || "-"}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Intent:</span> {lastIntent || "-"}
              </p>
              <p className="mt-1">
                <span className="font-semibold">Response:</span> {voiceResponse || "-"}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="glass rounded-2xl p-5">
        <h2 className="text-xl font-semibold">Patient Grid</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {patientCards.map((patient) => (
            <article key={patient.patientId} className="rounded-2xl bg-white/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-lg font-semibold">Patient {patient.patientId}</p>
                <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${riskClass(patient.riskLevel)}`}>
                  {patient.riskLevel}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-700">HR: {patient.heartRate}</p>
              <p className="text-sm text-slate-700">SpO2: {patient.spo2}</p>
              <p className="text-sm text-slate-700">Temp: {patient.temperature}</p>
              <p className="text-sm text-slate-700">BP: {patient.bloodPressure}</p>
              <p className="mt-2 font-mono text-xs text-slate-500">Updated: {new Date(patient.lastUpdated).toLocaleTimeString()}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Historical Timeline</h2>
          <button
            className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-900"
            type="button"
            onClick={() =>
              void refreshSummary().catch((err) => {
                setError(err instanceof Error ? err.message : "Could not refresh timeline");
              })
            }
          >
            Refresh Timeline
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {timelineEvents.length === 0 ? (
            <p className="rounded-xl bg-white/70 p-4 text-sm text-slate-600">No timeline events yet.</p>
          ) : (
            timelineEvents.map((event) => (
              <article key={event.id} className="rounded-2xl bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800">
                    {event.eventType === "alert" ? "Alert Event" : "Telemetry Event"} - Patient {event.patientId}
                  </p>
                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${timelineBadgeClass(event)}`}>
                    {event.eventType === "alert" ? (event.delivered ? "ALERT SENT" : "ALERT FAILED") : String(event.riskLevel || "STABLE")}
                  </span>
                </div>

                {event.eventType === "telemetry" ? (
                  <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2 xl:grid-cols-4">
                    <p>HR: {event.telemetry?.heartRate ?? "-"}</p>
                    <p>SpO2: {event.telemetry?.spo2 ?? "-"}</p>
                    <p>Temp: {event.telemetry?.temperature ?? "-"}</p>
                    <p>BP: {event.telemetry?.bloodPressure ?? "-"}</p>
                    <p className="md:col-span-2 xl:col-span-4">Reason: {event.reason || "-"}</p>
                  </div>
                ) : (
                  <div className="mt-3 grid gap-2 text-sm text-slate-700">
                    <p>Message: {event.message || "-"}</p>
                    <p>Language: {event.language || "-"}</p>
                    <p>Delivery Reason: {event.deliveryReason || "Delivered"}</p>
                  </div>
                )}

                <p className="mt-3 font-mono text-xs text-slate-500">
                  {new Date(event.occurredAt).toLocaleString()}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
