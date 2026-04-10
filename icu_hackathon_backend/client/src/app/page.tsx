"use client";

import Image from "next/image";
import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import SiteNavbar from "@/components/SiteNavbar";
import ScrollStack, { ScrollStackItem } from "@/components/ScrollStack";

const features = [
  {
    title: "Live Patient Monitoring",
    description:
      "Tracks heart rate, SpO2, temperature, and blood pressure in real time to detect risk signals instantly.",
    icon: "\u2665",
    accent: "icon-wrap",
  },
  {
    title: "Voice Clinical Assistant",
    description:
      "Doctors and nurses can ask by voice for patient status, ICU summary, and language switching without typing.",
    icon: "\ud83c\udfa4",
    accent: "icon-wrap-green",
  },
  {
    title: "Early Risk Alerts",
    description:
      "As soon as a critical pattern appears, Rapid AI broadcasts audio and data so the team can intervene faster.",
    icon: "\u26a0",
    accent: "icon-wrap",
  },
  {
    title: "Bilingual Workflow",
    description:
      "English and Hindi ready conversation flow that improves adoption in mixed-language wards.",
    icon: "\ud83c\udf10",
    accent: "icon-wrap-green",
  },
  {
    title: "Historical Timeline",
    description:
      "Past telemetry and alert history remain visible for audits, shift handovers, and better decisions.",
    icon: "\ud83d\udcc8",
    accent: "icon-wrap",
  },
  {
    title: "Actionable Dashboard",
    description:
      "At a single glance, view patient cards with critical, moderate, warning, and stable distributions.",
    icon: "\ud83d\udcca",
    accent: "icon-wrap-green",
  },
];

const faqs = [
  {
    q: "How does Rapid AI improve patient care?",
    a: "Rapid AI continuously watches heart rate, SpO2, temperature, and blood pressure trends in real time. As soon as a high-risk shift appears, it pushes priority alerts and clear escalation guidance so the team can intervene before the patient deteriorates further.",
    image: "/assets/faq1.png",
  },
  {
    q: "What can we ask in chat and voice modes?",
    a: "You can ask for patient-specific vitals, trend windows, ICU-wide summaries, risk reasoning, and action-oriented guidance. Both chat and voice are tuned for bedside rounds, nursing handovers, and fast consultant escalation updates.",
    image: "/assets/faq2.png",
  },
  {
    q: "Is it possible to give commands in Hindi?",
    a: "Yes. Rapid AI supports Hindi and English commands with quick language switching in workflow. This helps mixed-language ICU teams communicate faster and continue clinical discussions in the language each staff member is most comfortable with.",
    image: "/assets/faq3.png",
  },
  {
    q: "How does this website help the hospital team?",
    a: "Rapid AI unifies monitoring, triage communication, and alert context into one operational surface. Nurse stations, doctors, and escalation teams all see the same live timeline and risk state, reducing delays, duplicate calls, and handoff confusion.",
    image: "/assets/faq4.png",
  },
];

export default function HomePage() {
  return (
    <div className="page-shell pb-10">
      <SiteNavbar />

      <main className="container-wrap mt-8 space-y-12">
        <section className="overflow-visible px-3 py-4 md:px-6 md:py-7">
          <div className="max-w-5xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1">
              <span className="pulse-dot" />
              <span className="text-xs tracking-[0.22em] text-slate-300">RAPID AI LIVE CARE NETWORK</span>
            </div>

            <h1 className="hero-title">
              Your ICU Decisions,
              <span className="text-gradient"> Accelerated.</span>
            </h1>

            <p className="max-w-4xl text-lg leading-8 muted md:text-2xl md:leading-10">
              Rapid AI helps doctors and nurses detect patient deterioration early, retrieve status quickly by voice,
              and create timely action plans from one unified interface.
            </p>

            <div className="flex flex-wrap gap-4">
              <Link href="/chat" className="btn-base btn-green px-7 py-3.5 text-lg md:px-8">
                Start Voice Triage
              </Link>
              <Link href="/dashboard" className="btn-base btn-main px-7 py-3.5 text-lg md:px-8">
                Open Dashboard
              </Link>
            </div>
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
                You can use text or voice commands. Rapid AI combines patient vitals, risk patterns, and timeline events
                to generate context-aware responses.
              </p>
              <div className="grid gap-3">
                <div className="quick-card p-4">
                  <p className="text-sm font-semibold text-emerald-300">Voice Prompt</p>
                  <p className="mt-1 text-sm muted">&quot;Show me the current oxygen trend for patient 205.&quot;</p>
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
                <p className="mt-2 muted">Start by giving a patient-specific or unit-level command in Hindi or English.</p>
              </article>
              <article className="feature-card p-5">
                <p className="kicker">Step 02</p>
                <h4 className="mt-2 text-2xl font-semibold">Rapid AI Evaluates Live Context</h4>
                <p className="mt-2 muted">The system combines telemetry, risk rules, and event history to build a reliable response.</p>
              </article>
              <article className="feature-card p-5">
                <p className="kicker">Step 03</p>
                <h4 className="mt-2 text-2xl font-semibold">Actionable Output</h4>
                <p className="mt-2 muted">Clear summaries, voice feedback, and dashboard insights provide immediate next steps for the team.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="surface p-6 md:p-8">
          <div className="space-y-2">
            <p className="kicker">FAQ</p>
            <h3 className="text-3xl font-semibold md:text-4xl">Common questions before deployment</h3>
          </div>

          <div className="mt-5 faq-stack-shell">
            <ScrollStack
              className="faq-stack-scroll"
              itemDistance={120}
              itemScale={0.035}
              itemStackDistance={26}
              stackPosition="18%"
              scaleEndPosition="12%"
              baseScale={0.9}
              scaleDuration={0.35}
              blurAmount={0.2}
              useWindowScroll
            >
              {faqs.map((item, index) => (
                <ScrollStackItem key={item.q} itemClassName="faq-stack-card">
                  <article className="faq-stack-content">
                    <div className="faq-stack-copy">
                      <p className="faq-stack-step">FAQ {String(index + 1).padStart(2, "0")}</p>
                      <h4 className="faq-stack-question">{item.q}</h4>
                      <p className="faq-stack-answer">{item.a}</p>
                    </div>

                    <div className="faq-stack-media">
                      <Image
                        src={item.image}
                        alt={`FAQ visual ${index + 1}`}
                        width={920}
                        height={620}
                        className="faq-stack-image"
                      />
                    </div>
                  </article>
                </ScrollStackItem>
              ))}
            </ScrollStack>
          </div>
        </section>

        <section className="surface text-center p-8 md:p-12">
          <p className="kicker">Ready To Use</p>
          <h3 className="mt-2 text-4xl font-semibold md:text-5xl">
            Start using <span className="text-gradient">Rapid AI</span> in your ICU today
          </h3>
          <p className="mx-auto mt-4 max-w-2xl muted leading-7">
            In both chat and voice modes, clinical teams receive faster, clearer, and safer decision support.
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
