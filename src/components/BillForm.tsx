"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calcBill, CalcError, type BillResult, type DiscountType } from "@/lib/calc";
import { PAYMENT_LABELS, PAYMENT_METHODS, TAX_RATES, UNITS } from "@/lib/constants";
import { formatINR, rupeesToPaise } from "@/lib/money";
import { api, ApiError } from "@/lib/client";
import type { BillDto, SettingsDto } from "@/lib/types";

interface Row {
  key: number;
  itemName: string;
  itemCode: string;
  quantity: string;
  unit: string;
  rate: string; // rupees
  discountType: DiscountType;
  discount: string; // rupees or percent
  taxRate: number; // bps
}

interface Draft {
  idempotencyKey: string;
  customerName: string;
  customerMobile: string;
  customerAddress: string;
  rows: Row[];
  billDiscountType: DiscountType;
  billDiscount: string;
  otherCharges: string;
  paymentMethod: string;
  payFull: boolean;
  amountPaid: string;
}

const DRAFT_KEY = "tb_bill_draft_v1";
const MAX_MOBILE = /^(\+?91)?[6-9]\d{9}$/;

let keySeq = 1;
const newRow = (): Row => ({
  key: keySeq++, itemName: "", itemCode: "", quantity: "1", unit: "Piece", rate: "", discountType: "FIXED", discount: "", taxRate: 0,
});

const freshDraft = (method: string): Draft => ({
  idempotencyKey: crypto.randomUUID(),
  customerName: "", customerMobile: "", customerAddress: "",
  rows: [newRow()],
  billDiscountType: "FIXED", billDiscount: "", otherCharges: "",
  paymentMethod: method, payFull: true, amountPaid: "",
});

function percentToBps(s: string) {
  const v = s.trim();
  if (v === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return NaN;
  return Math.round(Number(v) * 100);
}

function discountToValue(type: DiscountType, s: string) {
  return type === "PERCENT" ? percentToBps(s) : rupeesToPaise(s);
}

export default function BillForm() {
  const router = useRouter();
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const submitting = useRef(false);
  const dirty = useRef(false);

  useEffect(() => {
    api<{ settings: SettingsDto }>("/api/settings")
      .then(({ settings }) => {
        setSettings(settings);
        let saved: Draft | null = null;
        try {
          saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
        } catch {}
        if (saved && Array.isArray(saved.rows) && saved.rows.length) {
          keySeq = Math.max(keySeq, ...saved.rows.map((r) => r.key + 1));
          setDraft(saved);
        } else setDraft(freshDraft(settings.defaultPayment));
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!draft) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {}
  }, [draft]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  const update = useCallback((patch: Partial<Draft>) => {
    dirty.current = true;
    setDraft((d) => (d ? { ...d, ...patch } : d));
  }, []);
  const updateRow = (key: number, patch: Partial<Row>) =>
    update({ rows: draft!.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) });

  const taxEnabled = settings?.taxEnabled ?? false;

  const calc = useMemo(() => {
    if (!draft || !settings) return { result: null as BillResult | null, error: "", payload: null as unknown };
    try {
      const items = draft.rows.map((r) => {
        const qty = Number(r.quantity);
        const price = rupeesToPaise(r.rate);
        const dv = discountToValue(r.discountType, r.discount);
        if (r.quantity.trim() === "" || Number.isNaN(qty)) throw new CalcError("Enter a valid quantity");
        if (Number.isNaN(price)) throw new CalcError("Enter a valid rate (max 2 decimals)");
        if (Number.isNaN(dv)) throw new CalcError("Enter a valid discount");
        return { quantity: qty, unitPrice: price, discountType: r.discountType, discountValue: dv, taxRate: r.taxRate };
      });
      const bd = discountToValue(draft.billDiscountType, draft.billDiscount);
      const oc = rupeesToPaise(draft.otherCharges);
      if (Number.isNaN(bd) || Number.isNaN(oc)) throw new CalcError("Enter valid discount / charges");
      const base = {
        items, billDiscountType: draft.billDiscountType, billDiscountValue: bd, otherCharges: oc,
        taxEnabled, taxMode: settings.taxMode, roundOff: settings.roundOff, paymentMethod: draft.paymentMethod,
      };
      const pre = calcBill({ ...base, amountPaid: 0 });
      const paid = draft.payFull ? pre.grandTotal : rupeesToPaise(draft.amountPaid);
      if (Number.isNaN(paid)) throw new CalcError("Enter a valid payment amount");
      const result = calcBill({ ...base, amountPaid: paid });
      return {
        result, error: "",
        payload: { ...base, amountPaid: paid },
      };
    } catch (e) {
      return { result: null, error: e instanceof CalcError ? e.message : "Invalid input", payload: null };
    }
  }, [draft, settings, taxEnabled]);

  function rowProblems(r: Row): string[] {
    const p: string[] = [];
    if (!r.itemName.trim()) p.push("name");
    if (!(Number(r.quantity) > 0)) p.push("qty");
    if (r.rate.trim() === "" || Number.isNaN(rupeesToPaise(r.rate))) p.push("rate");
    return p;
  }

  async function submit() {
    if (submitting.current || !draft || !calc.result) return;
    setShowErrors(true);
    setError("");
    if (draft.rows.some((r) => rowProblems(r).length)) return setError("Fix the highlighted item fields.");
    if (draft.customerMobile.trim() && !MAX_MOBILE.test(draft.customerMobile.replace(/[\s-]/g, ""))) {
      return setError("Enter a valid 10-digit mobile number.");
    }
    if (calc.error) return setError(calc.error);

    submitting.current = true;
    setBusy(true);
    const p = calc.payload as {
      billDiscountType: DiscountType; billDiscountValue: number; otherCharges: number; paymentMethod: string; amountPaid: number;
      items: { quantity: number; unitPrice: number; discountType: DiscountType; discountValue: number; taxRate: number }[];
    };
    const body = {
      idempotencyKey: draft.idempotencyKey,
      customerName: draft.customerName,
      customerMobile: draft.customerMobile,
      customerAddress: draft.customerAddress,
      items: draft.rows.map((r, i) => ({
        itemName: r.itemName, itemCode: r.itemCode, unit: r.unit, ...p.items[i],
      })),
      billDiscountType: p.billDiscountType,
      billDiscountValue: p.billDiscountValue,
      otherCharges: p.otherCharges,
      paymentMethod: p.paymentMethod,
      amountPaid: p.amountPaid,
    };
    const done = (id: string) => {
      dirty.current = false;
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      router.push(`/bills/${id}/preview${settings?.autoPreview === false ? "" : "?auto=1"}`);
    };
    try {
      const { bill } = await api<{ bill: BillDto }>("/api/bills", { method: "POST", json: body });
      done(bill.id);
    } catch (e) {
      // After a network failure the save may still have succeeded: ask the server before retrying.
      if (e instanceof ApiError && e.status === 0) {
        try {
          const { bill } = await api<{ bill: { id: string } | null }>(`/api/bills?idempotencyKey=${draft.idempotencyKey}`);
          if (bill) return done(bill.id);
          setError("Connection problem: the bill was NOT saved. Your entries are kept; press Generate to retry.");
        } catch {
          setError("Connection lost. Status unknown: do not re-enter the bill. Press Generate again (it will not create a duplicate).");
        }
      } else setError(e instanceof Error ? e.message : "Could not save the bill");
      submitting.current = false;
      setBusy(false);
    }
  }

  function clearForm() {
    if (dirty.current && !confirm("Clear the whole form?")) return;
    dirty.current = false;
    setShowErrors(false);
    setError("");
    setDraft(freshDraft(settings?.defaultPayment ?? "CASH"));
  }

  if (!draft || !settings) return error ? <div className="err">{error}</div> : <p className="text-sm text-slate-500">Loading...</p>;

  const r = calc.result;
  const bad = (row: Row, f: string) => showErrors && rowProblems(row).includes(f) ? "border-red-500" : "";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <section className="card grid gap-3 sm:grid-cols-3">
          <div>
            <label>Customer name (optional)</label>
            <input value={draft.customerName} maxLength={80} onChange={(e) => update({ customerName: e.target.value })} />
          </div>
          <div>
            <label>Mobile (optional)</label>
            <input value={draft.customerMobile} inputMode="tel" onChange={(e) => update({ customerMobile: e.target.value })} />
          </div>
          <div>
            <label>Address (optional)</label>
            <input value={draft.customerAddress} maxLength={200} onChange={(e) => update({ customerAddress: e.target.value })} />
          </div>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Items ({draft.rows.length})</h2>
            <button className="btn" type="button" onClick={() => update({ rows: [...draft.rows, newRow()] })}>+ Add item</button>
          </div>
          {draft.rows.map((row, idx) => {
            const line = r?.items[idx];
            return (
              <div key={row.key} className="space-y-2 rounded-md border border-slate-200 p-2">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-6">
                    <label>Item name</label>
                    <input
                      className={bad(row, "name")} value={row.itemName} maxLength={120}
                      onChange={(e) => updateRow(row.key, { itemName: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); update({ rows: [...draft.rows, newRow()] }); }
                      }}
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-3">
                    <label>Code</label>
                    <input value={row.itemCode} maxLength={40} onChange={(e) => updateRow(row.key, { itemCode: e.target.value })} />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label>Unit</label>
                    <select value={row.unit} onChange={(e) => updateRow(row.key, { unit: e.target.value })}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-12 items-end gap-2">
                  <div className="col-span-4 sm:col-span-2">
                    <label>Qty</label>
                    <input className={bad(row, "qty")} value={row.quantity} inputMode="decimal" onChange={(e) => updateRow(row.key, { quantity: e.target.value })} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label>Rate</label>
                    <input className={bad(row, "rate")} value={row.rate} inputMode="decimal" placeholder="0.00" onChange={(e) => updateRow(row.key, { rate: e.target.value })} />
                  </div>
                  <div className="col-span-4 sm:col-span-3">
                    <label>Discount</label>
                    <div className="flex gap-1">
                      <input value={row.discount} inputMode="decimal" onChange={(e) => updateRow(row.key, { discount: e.target.value })} />
                      <select className="!w-16" value={row.discountType} onChange={(e) => updateRow(row.key, { discountType: e.target.value as DiscountType })}>
                        <option value="FIXED">{"₹"}</option>
                        <option value="PERCENT">%</option>
                      </select>
                    </div>
                  </div>
                  {taxEnabled && (
                    <div className="col-span-4 sm:col-span-2">
                      <label>Tax</label>
                      <select value={row.taxRate} onChange={(e) => updateRow(row.key, { taxRate: Number(e.target.value) })}>
                        {TAX_RATES.map((t) => <option key={t} value={t}>{t / 100}%</option>)}
                      </select>
                    </div>
                  )}
                  <div className="col-span-8 text-right text-sm sm:col-span-3">
                    <div className="text-xs text-slate-500">Amount</div>
                    <div className="font-semibold">{line ? formatINR(line.lineTotal) : "-"}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn !px-2 !py-0.5 text-xs" onClick={() => {
                    const i = draft.rows.indexOf(row);
                    const copy = { ...row, key: keySeq++ };
                    update({ rows: [...draft.rows.slice(0, i + 1), copy, ...draft.rows.slice(i + 1)] });
                  }}>Duplicate</button>
                  <button type="button" className="btn !px-2 !py-0.5 text-xs" disabled={draft.rows.length === 1}
                    onClick={() => update({ rows: draft.rows.filter((x) => x.key !== row.key) })}>Remove</button>
                </div>
              </div>
            );
          })}
        </section>
      </div>

      <aside className="space-y-4">
        <section className="card space-y-3">
          <h2 className="font-semibold">Bill summary</h2>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label>Bill discount</label>
              <div className="flex gap-1">
                <input value={draft.billDiscount} inputMode="decimal" onChange={(e) => update({ billDiscount: e.target.value })} />
                <select className="!w-16" value={draft.billDiscountType} onChange={(e) => update({ billDiscountType: e.target.value as DiscountType })}>
                  <option value="FIXED">{"₹"}</option>
                  <option value="PERCENT">%</option>
                </select>
              </div>
            </div>
            <div>
              <label>Other charges</label>
              <input value={draft.otherCharges} inputMode="decimal" onChange={(e) => update({ otherCharges: e.target.value })} />
            </div>
          </div>
          {r ? (
            <dl className="space-y-1 text-sm">
              <S k="Subtotal" v={formatINR(r.subtotal)} />
              {r.itemDiscount > 0 && <S k="Item discount" v={"-" + formatINR(r.itemDiscount)} />}
              {r.billDiscount > 0 && <S k="Bill discount" v={"-" + formatINR(r.billDiscount)} />}
              {taxEnabled && <S k="Tax" v={formatINR(r.taxAmount)} />}
              {r.otherCharges > 0 && <S k="Other charges" v={formatINR(r.otherCharges)} />}
              {r.roundOff !== 0 && <S k="Round off" v={formatINR(r.roundOff)} />}
              <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span>{formatINR(r.grandTotal)}</span></div>
            </dl>
          ) : (
            <div className="err">{calc.error || "Enter item details"}</div>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Payment</h2>
          <div>
            <label>Method</label>
            <select value={draft.paymentMethod} onChange={(e) => update({ paymentMethod: e.target.value })}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-normal">
            <input type="checkbox" checked={draft.payFull} onChange={(e) => update({ payFull: e.target.checked, amountPaid: "" })} /> Paid in full
          </label>
          {!draft.payFull && (
            <div>
              <label>Amount paid</label>
              <input value={draft.amountPaid} inputMode="decimal" placeholder="0.00" onChange={(e) => update({ amountPaid: e.target.value })} />
            </div>
          )}
          {r && (
            <div className="space-y-1 text-sm">
              <S k="Paid" v={formatINR(r.amountPaid)} />
              {r.changeGiven > 0 && <S k="Change" v={formatINR(r.changeGiven)} />}
              <S k="Balance due" v={formatINR(r.balanceDue)} />
              <S k="Status" v={r.paymentStatus === "PAID" ? "Paid" : r.paymentStatus === "PARTIAL" ? "Partial" : "Unpaid"} />
            </div>
          )}
        </section>

        {error && <div className="err">{error}</div>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary flex-1" disabled={busy || !r} onClick={submit}>
            {busy ? "Saving..." : "Generate bill"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={clearForm}>Clear</button>
        </div>
      </aside>
    </div>
  );
}

function S({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
