"use client";

export class ApiError extends Error {
  constructor(public status: number, message: string, public field: string | null = null) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init?.json !== undefined ? { "Content-Type": "application/json" } : {}), ...init?.headers },
      body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
  if (res.status === 401 && !url.startsWith("/api/auth/login")) {
    window.location.href = "/login?msg=expired&next=" + encodeURIComponent(window.location.pathname);
    throw new ApiError(401, "Session expired");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; field?: string | null };
    throw new ApiError(res.status, d.error ?? "Request failed", d.field ?? null);
  }
  return data as T;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  return sp.toString();
}

export function formatDateTime(iso: string, tz = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}
export function formatDate(iso: string, tz = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium" }).format(new Date(iso));
}
