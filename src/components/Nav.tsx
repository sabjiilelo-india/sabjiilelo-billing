"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/billing/new", label: "New Bill", icon: "M12 5v14M5 12h14" },
  { href: "/bills", label: "Bill History", icon: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" },
  { href: "/reports", label: "Reports", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 000 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2l.4 2.7h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Nav({ username }: { username: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const links = (
    <nav className="flex flex-col gap-1">
      {LINKS.map((l) => {
        const active = path === l.href || path.startsWith(l.href + "/") || (l.href === "/bills" && path.startsWith("/bills"));
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${active ? "bg-brand-700 text-white shadow-sm" : "text-slate-600 hover:bg-brand-50 hover:text-brand-800"}`}
          >
            <Icon d={l.icon} /> {l.label}
          </Link>
        );
      })}
    </nav>
  );

  const user = (
    <div className="border-t pt-4">
      <div className="mb-2 flex items-center gap-2 px-1 text-sm">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 font-semibold uppercase text-brand-800">{username.charAt(0)}</span>
        <span className="truncate text-slate-700">{username}</span>
      </div>
      <button className="btn w-full" onClick={logout}>Logout</button>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col gap-6 border-r bg-white p-4 print:hidden md:flex">
        <Link href="/dashboard" className="block px-2 pt-2">
          <Image src="/logo-full-dark.webp" alt="Sabjii Le Lo" width={160} height={144} priority className="mx-auto h-auto w-36" />
        </Link>
        <div className="flex-1">{links}</div>
        {user}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 border-b bg-white print:hidden md:hidden">
        <div className="flex items-center justify-between px-4 py-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image src="/logo-full-dark.webp" alt="Sabjii Le Lo" width={44} height={40} className="h-10 w-auto" />
            <span className="font-bold text-brand-800">Sabjii Le Lo</span>
          </Link>
          <button className="btn !px-3" onClick={() => setOpen(!open)} aria-label="Menu">{open ? "Close" : "Menu"}</button>
        </div>
        {open && <div className="space-y-4 border-t p-4">{links}{user}</div>}
      </header>
    </>
  );
}
