"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Kind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: Kind;
  message: string;
}
interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

const STYLES: Record<Kind, string> = {
  success: "border-brand-300 bg-brand-50 text-brand-900",
  error: "border-red-300 bg-red-50 text-red-800",
  info: "border-slate-300 bg-white text-slate-800",
};
const ICONS: Record<Kind, string> = { success: "✓", error: "!", info: "i" };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(1);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (kind: Kind, message: string) => {
      const id = seq.current++;
      setItems((l) => [...l.slice(-3), { id, kind, message }]);
      setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,22rem)] flex-col gap-2 print:hidden" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"} className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${STYLES[t.kind]}`}>
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/10 text-xs font-bold">{ICONS[t.kind]}</span>
            <span className="flex-1">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-lg leading-none opacity-50 hover:opacity-100" aria-label="Dismiss">&times;</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside ToastProvider");
  return c;
}

/** Modal confirmation. Closes on Escape or backdrop click. */
export function ConfirmDialog({
  title, message, confirmLabel = "Confirm", danger, busy, onConfirm, onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onCancel, busy]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4 print:hidden" onClick={() => !busy && onCancel()}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="cd-title" className="card w-full max-w-sm space-y-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="cd-title" className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-600">{message}</p>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn" onClick={onCancel} disabled={busy} autoFocus>Cancel</button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Please wait..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
