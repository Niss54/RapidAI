"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/chat", label: "Patient Chat" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function SiteNavbar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 pt-4">
      <div className="container-wrap">
        <div className="nav-glass flex items-center justify-between rounded-2xl px-3 py-3 md:px-5">
          <Link href="/" className="flex items-center gap-2 px-2">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700" />
            <div>
              <p className="text-sm font-semibold tracking-wide text-white">RAPID AI</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">Care Copilot</p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-4 py-2 text-sm nav-link ${active ? "nav-link-active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/chat" className="btn-base btn-green px-4 py-2 text-sm">
              Start Talking
            </Link>
            <Link href="/dashboard" className="btn-base btn-ghost hidden px-4 py-2 text-sm sm:inline-flex">
              Patient Status
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
