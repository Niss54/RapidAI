"use client";

import { useMemo, useState } from "react";
import { queryVoice, toDataUrl, VoiceLanguage, VoiceQueryResponse } from "@/lib/api";
import SiteNavbar from "@/components/SiteNavbar";
import SiteFooter from "@/components/SiteFooter";

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

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  meta?: string;
};

const quickPrompts = [
  "Patient 204 ka current status batao",
  "Give ICU summary for all patients",
  "Is patient 205 high risk right now?",
  "Rapid AI hamare ward ko kaise help karta hai?",
  "Switch language to Hindi",
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return btoa(binary);
}

function playAudio(base64: string) {
  const audio = new Audio(toDataUrl(base64));
  void audio.play();
}

function appendAssistantFromResponse(result: VoiceQueryResponse): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    text: result.responseText,
    meta: `intent: ${result.intent}${result.patientId ? ` | patient: ${result.patientId}` : ""}`,
  };
}

export default function ChatPage() {
  const [language, setLanguage] = useState<VoiceLanguage>("en");
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text:
        "Rapid AI ready hai. Aap patient status, ICU summary, risk explanation, ya workflow help ke liye mujhse voice ya chat me puch sakte hain.",
      meta: "patient-aware response mode",
    },
  ]);

  const chatCount = useMemo(() => messages.length, [messages.length]);

  async function sendText(text: string) {
    const command = text.trim();
    if (!command) {
      return;
    }

    setError("");
    setSubmitting(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: command,
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const result = await queryVoice({ text: command, language });
      setLanguage(result.language);
      setMessages((prev) => [...prev, appendAssistantFromResponse(result)]);
      if (result.audioBase64) {
        playAudio(result.audioBase64);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process message");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoiceCapture() {
    setError("");
    setListening(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunks, { type: "audio/webm" });
          const base64 = arrayBufferToBase64(await blob.arrayBuffer());

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "user",
              text: "[Voice input]",
            },
          ]);

          const result = await queryVoice({ audioBase64: base64, language });
          setLanguage(result.language);

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: result.responseText,
              meta: `transcript: ${result.transcript}`,
            },
          ]);

          if (result.audioBase64) {
            playAudio(result.audioBase64);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Voice processing failed");
        } finally {
          stream.getTracks().forEach((track) => track.stop());
          setListening(false);
        }
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, 4200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone access denied");
      setListening(false);
    }
  }

  return (
    <div className="page-shell pb-10">
      <SiteNavbar />

      <main className="container-wrap mt-8 grid gap-4 lg:grid-cols-[0.28fr_0.72fr]">
        <aside className="surface p-4 md:p-5">
          <p className="kicker">Conversations</p>
          <h1 className="mt-2 text-2xl font-semibold">Rapid AI Chat</h1>
          <p className="mt-2 text-sm muted">Patient-focused commands aur care guidance ek hi जगह.</p>

          <div className="mt-4 space-y-2 text-sm">
            <div className="quick-card p-3">
              <p className="font-semibold text-slate-200">Active Thread</p>
              <p className="mt-1 muted">ICU Decision Support</p>
            </div>
            <div className="quick-card p-3">
              <p className="font-semibold text-slate-200">Messages</p>
              <p className="mt-1 text-emerald-300">{chatCount}</p>
            </div>
          </div>

          <div className="mt-5">
            <p className="kicker">Quick Prompts</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {quickPrompts.map((prompt) => (
                <button
                  key={prompt}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-left text-xs text-slate-300 hover:border-violet-400/50 hover:text-white"
                  onClick={() => {
                    setInput(prompt);
                  }}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="surface p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <p className="text-sm font-semibold text-slate-200">Rapid AI Care Copilot</p>
              <p className="text-xs muted">Chat + Voice commands for patient monitoring and app guidance</p>
            </div>

            <div className="flex items-center gap-2">
              <select
                className="input-dark rounded-lg px-3 py-2 text-sm"
                value={language}
                onChange={(event) => setLanguage(event.target.value as VoiceLanguage)}
              >
                {LANGUAGE_OPTIONS.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-base btn-green px-4 py-2 text-sm"
                onClick={() => {
                  void handleVoiceCapture();
                }}
                disabled={listening}
              >
                {listening ? "Listening..." : "Voice Call"}
              </button>
            </div>
          </div>

          <div className="mt-4 h-[54vh] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-black/25 p-3">
            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[88%] rounded-xl p-3 text-sm leading-7 ${
                  message.role === "user" ? "chat-bubble-user ml-auto" : "chat-bubble-ai"
                }`}
              >
                <p>{message.text}</p>
                {message.meta ? <p className="mt-2 text-xs text-slate-400">{message.meta}</p> : null}
              </article>
            ))}
          </div>

          {error ? <p className="mt-3 rounded-lg border border-rose-400/40 bg-rose-900/20 p-2 text-sm text-rose-300">{error}</p> : null}

          <div className="mt-4 flex gap-2">
            <input
              className="input-dark w-full rounded-xl px-4 py-3 text-sm"
              placeholder="Ask about patient condition, risk, alert history, or how Rapid AI can help..."
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void sendText(input);
                  setInput("");
                }
              }}
            />
            <button
              type="button"
              className="btn-base btn-main px-5 py-3 text-sm"
              onClick={() => {
                void sendText(input);
                setInput("");
              }}
              disabled={submitting}
            >
              {submitting ? "Sending..." : "Send"}
            </button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
