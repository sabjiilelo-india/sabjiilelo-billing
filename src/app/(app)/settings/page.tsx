"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { api } from "@/lib/client";
import { PAPER_SIZES, PAYMENT_LABELS } from "@/lib/constants";
import type { SettingsDto } from "@/lib/types";

const MAX_LOGO = 200 * 1024;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

type Errors = Partial<Record<keyof SettingsDto, string>>;

function validate(s: SettingsDto): Errors {
  const e: Errors = {};
  if (!s.shopName.trim()) e.shopName = "Shop name is required";
  else if (s.shopName.length > 80) e.shopName = "At most 80 characters";
  const digits = s.phone.replace(/\D/g, "");
  if (s.phone.trim() && (!/^[0-9+()\s-]+$/.test(s.phone) || digits.length < 7 || digits.length > 15)) e.phone = "Enter a valid phone number";
  if (s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.email.trim())) e.email = "Enter a valid email address";
  if (s.gstin && !GSTIN.test(s.gstin)) e.gstin = "Invalid GSTIN (e.g. 22AAAAA0000A1Z5)";
  if (s.taxEnabled && !s.gstin) e.gstin = "GSTIN is required when GST is enabled";
  if (!/^[A-Za-z0-9-]{0,10}$/.test(s.invoicePrefix)) e.invoicePrefix = "Letters, digits and - only (max 10)";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: s.timeZone });
  } catch {
    e.timeZone = "Unknown time zone (e.g. Asia/Kolkata)";
  }
  if (!Number.isInteger(s.fontSize) || s.fontSize < 8 || s.fontSize > 20) e.fontSize = "Between 8 and 20";
  if (!Number.isInteger(s.copies) || s.copies < 1 || s.copies > 5) e.copies = "Between 1 and 5";
  return e;
}

export default function SettingsPage() {
  const toast = useToast();
  const [s, setS] = useState<SettingsDto | null>(null);
  const [loadError, setLoadError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: SettingsDto }>("/api/settings?full=1").then((d) => setS(d.settings)).catch((e) => setLoadError(e.message));
  }, []);

  if (!s) return loadError ? <div className="err">{loadError}</div> : <p className="text-sm text-slate-500">Loading...</p>;

  const errors = validate(s);
  const set = <K extends keyof SettingsDto>(k: K, v: SettingsDto[K]) => setS({ ...s, [k]: v });
  const touch = (k: string) => setTouched((t) => new Set(t).add(k));
  const err = (k: keyof SettingsDto) => (submitted || touched.has(k) ? errors[k] : undefined);
  const field = (k: keyof SettingsDto) => ({
    "aria-invalid": !!err(k),
    className: err(k) ? "!border-red-500 focus:!ring-red-200" : "",
    onBlur: () => touch(k),
  });

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return void toast.error("Logo must be a PNG, JPEG or WebP image.");
    if (file.size > MAX_LOGO) return void toast.error("Logo must be smaller than 200 KB.");
    const reader = new FileReader();
    reader.onload = () => {
      set("logo", String(reader.result));
      toast.info("Logo selected. Press Save settings to apply it.");
    };
    reader.onerror = () => toast.error("Could not read that image.");
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const n = Object.keys(errors).length;
    if (n) {
      toast.error(`Please fix the ${n} highlighted field${n === 1 ? "" : "s"}.`);
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      const { settings } = await api<{ settings: SettingsDto }>("/api/settings", { method: "PUT", json: s });
      setS(settings);
      setSubmitted(false);
      setTouched(new Set());
      toast.success("Settings saved. New bills use them; old bills keep their original details.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  const Err = ({ k }: { k: keyof SettingsDto }) => (err(k) ? <p className="mt-1 text-xs text-red-600">{err(k)}</p> : null);

  return (
    <form onSubmit={save} className="max-w-3xl space-y-5" noValidate>
      <h1 className="page-title">Settings</h1>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="card-title sm:col-span-2">Shop details</h2>
        <div><label>Shop name *</label><input {...field("shopName")} value={s.shopName} maxLength={80} onChange={(e) => set("shopName", e.target.value)} /><Err k="shopName" /></div>
        <div><label>Phone</label><input {...field("phone")} value={s.phone} maxLength={20} inputMode="tel" onChange={(e) => set("phone", e.target.value)} /><Err k="phone" /></div>
        <div className="sm:col-span-2"><label>Address</label><textarea rows={2} value={s.address} maxLength={200} onChange={(e) => set("address", e.target.value)} /></div>
        <div><label>Email</label><input {...field("email")} type="email" value={s.email} onChange={(e) => set("email", e.target.value)} /><Err k="email" /></div>
        <div><label>GSTIN{s.taxEnabled ? " *" : ""}</label><input {...field("gstin")} value={s.gstin} maxLength={15} onChange={(e) => set("gstin", e.target.value.toUpperCase())} /><Err k="gstin" /></div>
        <div className="sm:col-span-2"><label>Receipt footer message</label><input value={s.footerMessage} maxLength={200} onChange={(e) => set("footerMessage", e.target.value)} /></div>
        <div className="sm:col-span-2">
          <label>Logo (PNG/JPEG/WebP, under 200 KB)</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} />
          {s.logo && (
            <div className="mt-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logo} alt="Logo" className="max-h-16" />
              <button type="button" className="btn" onClick={() => set("logo", "")}>Remove</button>
            </div>
          )}
        </div>
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="card-title sm:col-span-2">Billing</h2>
        <div><label>Invoice prefix</label><input {...field("invoicePrefix")} value={s.invoicePrefix} maxLength={10} onChange={(e) => set("invoicePrefix", e.target.value)} /><Err k="invoicePrefix" /></div>
        <div><label>Time zone</label><input {...field("timeZone")} value={s.timeZone} onChange={(e) => set("timeZone", e.target.value)} /><Err k="timeZone" /></div>
        <div>
          <label>Default payment method</label>
          <select value={s.defaultPayment} onChange={(e) => set("defaultPayment", e.target.value)}>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end text-sm font-normal">
          <input type="checkbox" checked={s.roundOff} onChange={(e) => set("roundOff", e.target.checked)} /> Round total to nearest rupee
        </label>
        <label className="flex items-center gap-2 text-sm font-normal sm:col-span-2">
          <input type="checkbox" checked={s.taxEnabled} onChange={(e) => { set("taxEnabled", e.target.checked); touch("gstin"); }} /> Charge GST on bills (requires a valid GSTIN)
        </label>
        {s.taxEnabled && (
          <div>
            <label>GST type</label>
            <select value={s.taxMode} onChange={(e) => set("taxMode", e.target.value as "INTRA" | "INTER")}>
              <option value="INTRA">Same state: CGST + SGST</option>
              <option value="INTER">Other state: IGST</option>
            </select>
          </div>
        )}
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="card-title sm:col-span-2">Printer</h2>
        <div>
          <label>Paper size</label>
          <select value={s.paperSize} onChange={(e) => set("paperSize", Number(e.target.value))}>
            {PAPER_SIZES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
        <div><label>Printer name (note only)</label><input value={s.printerName} maxLength={80} onChange={(e) => set("printerName", e.target.value)} /></div>
        <div><label>Font size (px)</label><input {...field("fontSize")} type="number" min={8} max={20} value={s.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))} /><Err k="fontSize" /></div>
        <div><label>Copies</label><input {...field("copies")} type="number" min={1} max={5} value={s.copies} onChange={(e) => set("copies", Number(e.target.value))} /><Err k="copies" /></div>
        <label className="flex items-center gap-2 text-sm font-normal sm:col-span-2">
          <input type="checkbox" checked={s.autoPreview} onChange={(e) => set("autoPreview", e.target.checked)} /> Open the print dialog automatically after generating a bill
        </label>
      </section>

      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save settings"}</button>
    </form>
  );
}
