"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchHealth, fetchIcuSummary, IcuSummaryResponse } from "@/lib/api";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";

type Snapshot = {
  service: string;
  summary: IcuSummaryResponse["summary"];
};

const FALLBACK_SUMMARY: IcuSummaryResponse["summary"] = {
  critical: 0,
  moderate: 0,
  warning: 0,
  stable: 0,
  total: 0,
};

const features = [
  {
    title: "Live Patient Monitoring",
    description:
      "Heart rate, SpO2, temperature, and blood pressure ko realtime track karke risk signals instantly detect karta hai.",
    icon: "\u2665",
    accent: "icon-wrap",
  },
  {
    title: "Voice Clinical Assistant",
    description:
      "Doctor ya nurse voice me puch sakte hain: patient status, ICU summary, aur language switch without typing.",
    icon: "\ud83c\udfa4",
    accent: "icon-wrap-green",
  },
  {
    title: "Early Risk Alerts",
    description:
      "Critical pattern milte hi Rapid AI audio + data broadcast karta hai so team faster intervene kar sake.",
    icon: "\u26a0",
    accent: "icon-wrap",
  },
  {
    title: "Bilingual Workflow",
    description:
      "English + Hindi ready conversation flow, jisse mixed-language wards me adoption easy hota hai.",
    icon: "\ud83c\udf10",
    accent: "icon-wrap-green",
  },
  {
    title: "Historical Timeline",
    description:
      "Past telemetry aur alert history visible rehti hai for audit, shift handover, and better decisions.",
    icon: "\ud83d\udcc8",
    accent: "icon-wrap",
  },
  {
    title: "Actionable Dashboard",
    description:
      "Single glance me critical, moderate, warning, stable distribution ke saath patient cards available.",
    icon: "\ud83d\udcca",
    accent: "icon-wrap-green",
  },
];

const faqs = [
  {
    q: "Rapid AI kis tarah patient care improve karta hai?",
    a: "Rapid AI vital trends ko continuously evaluate karta hai aur high-risk changes par instant alerts deta hai. Isse clinical response time reduce hota hai.",
  },
  {
    q: "Chat aur voice dono me kya puch sakte hain?",
    a: "Aap patient-specific status, ICU summary, risk level explanation, aur workflow guidance puch sakte hain. Voice mode bedside use ke liye optimized hai.",
  },
  {
    q: "Hindi me command dena possible hai?",
    a: "Haan, Rapid AI bilingual hai. Language switch command ke through Hindi/English response mode change ho jata hai.",
  },
  {
    q: "Ye website hospital team ko kaise help karti hai?",
    a: "Rapid AI monitoring, communication, aur alerting ko unify karta hai. Nurse station aur doctor rounds dono me same source of truth milta hai.",
  },
];

export default function HomePage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let alive = true;

    async function refresh() {
      try {
        const [health, summary] = await Promise.all([fetchHealth(), fetchIcuSummary()]);
        if (!alive) {
          return;
        }
        setSnapshot({ service: health.service, summary: summary.summary });
      } catch {
        if (!alive) {
          return;
        }
        setSnapshot((prev) =>
          prev ?? {
            service: "rapid-ai-server",
            summary: FALLBACK_SUMMARY,
          }
        );
      }
    }

    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 10000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => snapshot?.summary ?? FALLBACK_SUMMARY, [snapshot]);

  return (
    <div className="page-shell pb-10">
      <SiteNavbar />

      <main className="container-wrap mt-8 space-y-12">
        <section className="surface overflow-hidden p-7 md:p-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1.12fr_0.88fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
                <span className="pulse-dot" />
                <span className="text-xs tracking-[0.22em] text-slate-300">RAPID AI LIVE CARE NETWORK</span>
              </div>

              <h1 className="hero-title">
                Your ICU Decisions,
                <span className="text-gradient"> Accelerated.</span>
              </h1>

              <p className="max-w-2xl text-base leading-7 muted md:text-lg">
                Rapid AI doctors aur nurses ko patient deterioration early detect karne, voice se quick status lene,
                aur timely action plan banane me help karta hai - all from one unified interface.
              </p>

              <div className="flex flex-wrap gap-3">
                <Link href="/chat" className="btn-base btn-green px-6 py-3 text-base">
                  Start Voice Triage
                </Link>
                <Link href="/dashboard" className="btn-base btn-main px-6 py-3 text-base">
                  Open Dashboard
                </Link>
              </div>

              <div className="grid gap-3 pt-1 sm:grid-cols-3">
                <div className="stat-card p-4">
                  <p className="kicker">Critical</p>
                  <p className="mt-2 text-3xl font-semibold text-rose-400">{summary.critical}</p>
                </div>
                <div className="stat-card p-4">
                  <p className="kicker">Under Watch</p>
                  <p className="mt-2 text-3xl font-semibold text-amber-400">{summary.moderate + summary.warning}</p>
                </div>
                <div className="stat-card p-4">
                  <p className="kicker">Stable</p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-400">{summary.stable}</p>
                </div>
              </div>
            </div>

            <aside className="surface-soft p-5 md:p-6 fade-in-up">
              <div className="flex items-center justify-between">
                <p className="kicker">Control Room</p>
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  online
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <article className="chat-bubble-ai rounded-xl p-3">
                  <p className="font-semibold text-slate-200">Rapid AI</p>
                  <p className="mt-1 muted">Patient 204 ka trend unstable hai. SpO2 dip alerts last 15 min me increase hue.</p>
                </article>

                <article className="chat-bubble-user rounded-xl p-3">
                  <p className="font-semibold text-emerald-200">Doctor Query</p>
                  <p className="mt-1 text-emerald-100">&quot;Give me current risk summary in Hindi.&quot;</p>
                </article>

                <article className="chat-bubble-ai rounded-xl p-3">
                  <p className="font-semibold text-slate-200">Rapid AI Response</p>
                  <p className="mt-1 muted">&quot;ICU me 1 critical, 2 moderate aur 4 stable patients hain.&quot;</p>
                </article>
              </div>

              <div className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-400">
                Active backend: <span className="font-semibold text-slate-200">{snapshot?.service ?? "loading"}</span>
              </div>
            </aside>
          </div>
        </section>

        <section className="space-y-5">
          <div className="space-y-2 text-center">
            <p className="kicker">Core Features</p>
            <h2 className="text-3xl font-semibold md:text-4xl">What Rapid AI does for every patient workflow</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="feature-card p-5">
                <div className={`inline-flex ${feature.accent} float-soft`}>{feature.icon}</div>
                <h3 className="mt-4 text-xl font-semibold text-slate-100">{feature.title}</h3>
                <p className="mt-2 leading-7 muted">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="surface p-6 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-4">
              <p className="kicker">Chat + Voice Flow</p>
              <h3 className="text-3xl font-semibold md:text-4xl">From bedside question to response in seconds</h3>
              <p className="muted leading-7">
                Aap text ya voice command दे सकते hain. Rapid AI patient vitals, risk pattern aur timeline events combine
                karke context-aware response deta hai.
              </p>
              <div className="grid gap-3">
                <div className="quick-card p-4">
                  <p className="text-sm font-semibold text-emerald-300">Voice Prompt</p>
                  <p className="mt-1 text-sm muted">&quot;Patient 205 ka current oxygen trend batao.&quot;</p>
                </div>
                <div className="quick-card p-4">
                  <p className="text-sm font-semibold text-violet-300">Chat Prompt</p>
                  <p className="mt-1 text-sm muted">&quot;How can this app help us reduce night shift response delays?&quot;</p>
                </div>
                <div className="quick-card p-4">
                  <p className="text-sm font-semibold text-amber-300">Safety Prompt</p>
                  <p className="mt-1 text-sm muted">&quot;Show last 20 minutes alerts before I escalate to ICU consultant.&quot;</p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <article className="feature-card p-5">
                <p className="kicker">Step 01</p>
                <h4 className="mt-2 text-2xl font-semibold">Speak or Type Situation</h4>
                <p className="mt-2 muted">Hindi ya English me patient-specific ya unit-level command dena start point hai.</p>
              </article>
              <article className="feature-card p-5">
                <p className="kicker">Step 02</p>
                <h4 className="mt-2 text-2xl font-semibold">Rapid AI Evaluates Live Context</h4>
                <p className="mt-2 muted">System telemetry + risk rules + event history combine karke reliable response build karta hai.</p>
              </article>
              <article className="feature-card p-5">
                <p className="kicker">Step 03</p>
                <h4 className="mt-2 text-2xl font-semibold">Actionable Output</h4>
                <p className="mt-2 muted">Clear summary, voice feedback, and dashboard insights team ko immediate next step dete hain.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="surface p-6 md:p-8">
          <div className="space-y-2">
            <p className="kicker">FAQ</p>
            <h3 className="text-3xl font-semibold md:text-4xl">Common questions before deployment</h3>
          </div>

          <div className="mt-5 space-y-3">
            {faqs.map((item) => (
              <details key={item.q} className="faq-row group p-4">
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-base font-semibold text-slate-100 md:text-lg">
                  {item.q}
                  <span className="text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-7 muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="surface text-center p-8 md:p-12">
          <p className="kicker">Ready To Use</p>
          <h3 className="mt-2 text-4xl font-semibold md:text-5xl">
            Start using <span className="text-gradient">Rapid AI</span> in your ICU today
          </h3>
          <p className="mx-auto mt-4 max-w-2xl muted leading-7">
            Chat and voice dono modes me clinical team ko faster, clearer aur safer decision support milega.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/chat" className="btn-base btn-green px-6 py-3 text-base">
              Talk To Rapid AI
            </Link>
            <Link href="/dashboard" className="btn-base btn-ghost px-6 py-3 text-base">
              View Patient Dashboard
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
