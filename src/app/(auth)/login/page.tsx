"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";

function LoginForm() {
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!username.trim()) errs.username = "Username is required";
    if (!password) errs.password = "Password is required";
    setErrors(errs);
    setError("");
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api("/api/auth/login", { method: "POST", json: { username, password, remember } });
      const next = params.get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4 !p-7 shadow-md" noValidate>
      <Image src="/logo-full-dark.webp" alt="Sabjii Le Lo" width={180} height={162} priority className="mx-auto h-auto w-40" />
      <div className="text-center">
        <h1 className="text-lg font-bold text-brand-900">Billing Portal</h1>
        <p className="text-sm text-slate-500">Sign in to continue</p>
      </div>
      {error && <div className="err">{error}</div>}
      <div>
        <label htmlFor="u">Username</label>
        <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus />
        {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
      </div>
      <div>
        <label htmlFor="p">Password</label>
        <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm font-normal">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember session (30 days)
      </label>
      <button className="btn btn-primary w-full" disabled={busy}>
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
