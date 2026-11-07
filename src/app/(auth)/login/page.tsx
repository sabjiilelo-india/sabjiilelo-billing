"use client";

import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client";

function LoginForm() {
  const params = useSearchParams();
  const toast = useToast();
  const msg = params.get("msg");
  useEffect(() => {
    if (msg === "loggedout") toast.success("You have been logged out successfully.");
    if (msg === "expired") toast.info("Your session expired. Please sign in again.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msg]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!username.trim()) errs.username = "Username is required";
    else if (username.trim().length < 3) errs.username = "Username must be at least 3 characters";
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
      const m = e instanceof Error ? e.message : "Login failed";
      setError(m);
      toast.error(m);
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
        <input
          id="u"
          value={username}
          maxLength={50}
          aria-invalid={!!errors.username}
          className={errors.username ? "!border-red-500 focus:!ring-red-200" : ""}
          onChange={(e) => {
            setUsername(e.target.value);
            if (errors.username) setErrors((p) => ({ ...p, username: undefined }));
          }}
          autoComplete="username"
          autoFocus
        />
        {errors.username && <p className="mt-1 text-xs text-red-600">{errors.username}</p>}
      </div>
      <div>
        <label htmlFor="p">Password</label>
        <div className="relative">
          <input
            id="p"
            type={showPassword ? "text" : "password"}
            value={password}
            maxLength={128}
            aria-invalid={!!errors.password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
            }}
            autoComplete="current-password"
            className={`!pr-10 ${errors.password ? "!border-red-500 focus:!ring-red-200" : ""}`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-500 hover:text-brand-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {showPassword ? (
                <>
                  <path d="M3 3l18 18" />
                  <path d="M10.6 6.1A9.8 9.8 0 0112 6c5 0 8.5 4.2 9.5 6a11.6 11.6 0 01-2.6 3.2M6.5 7.6A11.6 11.6 0 002.5 12c1 1.8 4.5 6 9.5 6a9.7 9.7 0 004-.9" />
                  <path d="M9.9 9.9a3 3 0 004.2 4.2" />
                </>
              ) : (
                <>
                  <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
          </button>
        </div>
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
