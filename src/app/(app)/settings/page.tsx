"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PAYMENT_LABELS } from "@/lib/constants";
import type { SettingsDto } from "@/lib/types";

const MAX_LOGO = 200 * 1024;

export default function SettingsPage() {
  const [s, setS] = useState<SettingsDto | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ settings: SettingsDto }>("/api/settings").then((d) => setS(d.settings)).catch((e) => setError(e.message));
  }, []);

  if (!s) return error ? <div className="err">{error}</div> : <p className="text-sm text-slate-500">Loading...</p>;
  const set = <K extends keyof SettingsDto>(k: K, v: SettingsDto[K]) => { setOk(false); setS({ ...s, [k]: v }); };

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return setError("Logo must be PNG, JPEG or WebP");
    if (file.size > MAX_LOGO) return setError("Logo must be under 200 KB");
    setError("");
    const reader = new FileReader();
    reader.onload = () => set("logo", String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk(false);
    if (!s!.shopName.trim()) return setError("Shop name is required");
    setBusy(true);
    try {
      const { settings } = await api<{ settings: SettingsDto }>("/api/settings", { method: "PUT", json: s });
      setS(settings);
      setOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="max-w-3xl space-y-4">
      <h1 className="page-title">Settings</h1>
      {error && <div className="err">{error}</div>}
      {ok && <div className="ok">Settings saved. New bills will use them; old bills keep their original details.</div>}

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Shop details</h2>
        <div><label>Shop name *</label><input value={s.shopName} maxLength={80} onChange={(e) => set("shopName", e.target.value)} /></div>
        <div><label>Phone</label><input value={s.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="sm:col-span-2"><label>Address</label><textarea rows={2} value={s.address} maxLength={200} onChange={(e) => set("address", e.target.value)} /></div>
        <div><label>Email</label><input value={s.email} onChange={(e) => set("email", e.target.value)} /></div>
        <div><label>GSTIN</label><input value={s.gstin} maxLength={15} onChange={(e) => set("gstin", e.target.value.toUpperCase())} /></div>
        <div className="sm:col-span-2"><label>Receipt footer message</label><input value={s.footerMessage} maxLength={200} onChange={(e) => set("footerMessage", e.target.value)} /></div>
        <div className="sm:col-span-2">
          <label>Logo (PNG/JPEG/WebP, under 200 KB)</label>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} />
          {s.logo && (
            <div className="mt-2 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logo} alt="Logo" className="max-h-14 grayscale" />
              <button type="button" className="btn" onClick={() => set("logo", "")}>Remove</button>
            </div>
          )}
        </div>
      </section>

      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Billing</h2>
        <div><label>Invoice prefix</label><input value={s.invoicePrefix} maxLength={10} onChange={(e) => set("invoicePrefix", e.target.value)} /></div>
        <div><label>Time zone</label><input value={s.timeZone} onChange={(e) => set("timeZone", e.target.value)} /></div>
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
          <input type="checkbox" checked={s.taxEnabled} onChange={(e) => set("taxEnabled", e.target.checked)} /> Charge GST on bills (requires a valid GSTIN)
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
        <h2 className="font-semibold sm:col-span-2">Printer</h2>
        <div>
          <label>Paper size</label>
          <select value={s.paperSize} onChange={(e) => set("paperSize", Number(e.target.value) as 58 | 80)}>
            <option value={80}>80 mm</option>
            <option value={58}>58 mm</option>
          </select>
        </div>
        <div><label>Printer name (note only)</label><input value={s.printerName} onChange={(e) => set("printerName", e.target.value)} /></div>
        <div><label>Font size (px)</label><input type="number" min={8} max={20} value={s.fontSize} onChange={(e) => set("fontSize", Number(e.target.value))} /></div>
        <div><label>Copies</label><input type="number" min={1} max={5} value={s.copies} onChange={(e) => set("copies", Number(e.target.value))} /></div>
        <label className="flex items-center gap-2 text-sm font-normal sm:col-span-2">
          <input type="checkbox" checked={s.autoPreview} onChange={(e) => set("autoPreview", e.target.checked)} /> Open the print dialog automatically after generating a bill
        </label>
      </section>

      <button className="btn btn-primary" disabled={busy}>{busy ? "Saving..." : "Save settings"}</button>
    </form>
  );
}
