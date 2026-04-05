import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/10 py-8">
      <div className="container-wrap flex flex-col gap-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-xs font-bold text-white">
            R
          </span>
          <p>
            <span className="font-semibold text-slate-200">Rapid AI</span> by Team Syntrix
          </p>
        </div>

        <p className="muted text-xs md:text-sm">
          Patient-centric voice triage, live monitoring, and faster critical decision support.
        </p>

        <div className="flex items-center gap-4 text-xs uppercase tracking-[0.18em]">
          <Link href="/chat" className="hover:text-white">
            Chat
          </Link>
          <Link href="/dashboard" className="hover:text-white">
            Dashboard
          </Link>
        </div>
      </div>
    </footer>
  );
}
