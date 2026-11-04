"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { calcBill, CalcError, LIMITS, type BillResult, type DiscountType } from "@/lib/calc";
import { PAYMENT_LABELS, PAYMENT_METHODS, TAX_RATES, UNITS, WHOLE_UNITS } from "@/lib/constants";
import { formatINR, rupeesToPaise } from "@/lib/money";
import { api, ApiError } from "@/lib/client";
import type { BillDto, SettingsDto } from "@/lib/types";
import { useToast } from "./Toast";

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
const MOBILE = /^(\+?91)?[6-9]\d{9}$/;

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
const discountToValue = (type: DiscountType, s: string) => (type === "PERCENT" ? percentToBps(s) : rupeesToPaise(s));

// ---------------------------------------------------------------- validation

interface RowErrors { name?: string; qty?: string; rate?: string; discount?: string }
interface Errors {
  mobile?: string;
  rows: Record<number, RowErrors>;
  billDiscount?: string;
  otherCharges?: string;
  amountPaid?: string;
  form?: string;
  count: number;
}

function validate(d: Draft, s: SettingsDto): { errors: Errors; result: BillResult | null; payload: ReturnType<typeof buildPayload> | null } {
  const errors: Errors = { rows: {}, count: 0 };
  const bump = () => { errors.count++; };

  const mobile = d.customerMobile.replace(/[\s-]/g, "");
  if (mobile && !MOBILE.test(mobile)) { errors.mobile = "Enter a valid 10-digit mobile number"; bump(); }

  const parsed = d.rows.map((r) => {
    const e: RowErrors = {};
    const qty = Number(r.quantity);
    const price = rupeesToPaise(r.rate);
    if (!r.itemName.trim()) e.name = "Item name is required";
    if (r.quantity.trim() === "") e.qty = "Quantity is required";
    else if (!Number.isFinite(qty) || qty <= 0) e.qty = "Must be greater than zero";
    else if (qty > LIMITS.maxQuantity) e.qty = "Maximum quantity is 10,000";
    else if (!/^\d+(\.\d{1,3})?$/.test(r.quantity.trim())) e.qty = "Use at most 3 decimals";
    else if (WHOLE_UNITS.includes(r.unit) && !Number.isInteger(qty)) e.qty = `${r.unit} must be a whole number`;
    if (r.rate.trim() === "") e.rate = "Rate is required";
    else if (Number.isNaN(price)) e.rate = "Enter a valid amount (max 2 decimals)";
    else if (price <= 0) e.rate = "Must be greater than zero";
    else if (price > LIMITS.maxUnitPrice) e.rate = "Rate is too large";

    const dv = discountToValue(r.discountType, r.discount);
    if (Number.isNaN(dv)) e.discount = "Enter a valid discount";
    else if (r.discountType === "PERCENT" && dv > 10000) e.discount = "Cannot exceed 100%";
    else if (r.discountType === "FIXED" && !e.qty && !e.rate && dv > Math.round(qty * price)) e.discount = "Exceeds the item amount";

    if (Object.keys(e).length) { errors.rows[r.key] = e; errors.count += Object.keys(e).length; }
    return { qty, price, dv };
  });

  const bd = discountToValue(d.billDiscountType, d.billDiscount);
  const oc = rupeesToPaise(d.otherCharges);
  if (Number.isNaN(bd)) { errors.billDiscount = "Enter a valid discount"; bump(); }
  else if (d.billDiscountType === "PERCENT" && bd > 10000) { errors.billDiscount = "Cannot exceed 100%"; bump(); }
  if (Number.isNaN(oc)) { errors.otherCharges = "Enter a valid amount"; bump(); }

  if (errors.count) return { errors, result: null, payload: null };

  try {
    const base = {
      items: parsed.map((p, i) => ({
        quantity: p.qty, unitPrice: p.price, discountType: d.rows[i].discountType, discountValue: p.dv, taxRate: d.rows[i].taxRate,
      })),
      billDiscountType: d.billDiscountType, billDiscountValue: bd, otherCharges: oc,
      taxEnabled: s.taxEnabled, taxMode: s.taxMode, roundOff: s.roundOff, paymentMethod: d.paymentMethod,
    };
    const pre = calcBill({ ...base, amountPaid: 0 });
    let paid = pre.grandTotal;
    if (!d.payFull) {
      paid = rupeesToPaise(d.amountPaid);
      if (d.amountPaid.trim() === "") { errors.amountPaid = "Enter the amount received"; bump(); }
      else if (Number.isNaN(paid)) { errors.amountPaid = "Enter a valid amount (max 2 decimals)"; bump(); }
      else if (paid > pre.grandTotal && d.paymentMethod !== "CASH") { errors.amountPaid = "Cannot exceed the total for non-cash payments"; bump(); }
    }
    if (errors.count) return { errors, result: null, payload: null };
    const result = calcBill({ ...base, amountPaid: paid });
    return { errors, result, payload: buildPayload(d, base, paid) };
  } catch (e) {
    const msg = e instanceof CalcError ? e.message : "Invalid input";
    if (/bill discount|Discount cannot exceed the bill/i.test(msg)) errors.billDiscount = "Exceeds the bill total";
    else errors.form = msg;
    bump();
    return { errors, result: null, payload: null };
  }
}

function buildPayload(
  d: Draft,
  base: { items: { quantity: number; unitPrice: number; discountType: DiscountType; discountValue: number; taxRate: number }[]; billDiscountType: DiscountType; billDiscountValue: number; otherCharges: number; paymentMethod: string },
  paid: number,
) {
  return {
    idempotencyKey: d.idempotencyKey,
    customerName: d.customerName.trim(),
    customerMobile: d.customerMobile,
    customerAddress: d.customerAddress.trim(),
    items: d.rows.map((r, i) => ({
      itemName: r.itemName.trim(), itemCode: r.itemCode.trim(), unit: r.unit, ...base.items[i],
    })),
    billDiscountType: base.billDiscountType,
    billDiscountValue: base.billDiscountValue,
    otherCharges: base.otherCharges,
    paymentMethod: base.paymentMethod,
    amountPaid: paid,
  };
}

// ---------------------------------------------------------------- component

export default function BillForm() {
  const router = useRouter();
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
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
          toast.info("Restored your unsaved bill draft.");
        } else setDraft(freshDraft(settings.defaultPayment));
      })
      .catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const touch = (id: string) => setTouched((t) => (t.has(id) ? t : new Set(t).add(id)));

  const taxEnabled = settings?.taxEnabled ?? false;
  const v = useMemo(() => (draft && settings ? validate(draft, settings) : null), [draft, settings]);

  /** An error is visible once the field was touched or a submit was attempted. */
  const show = (id: string, msg?: string) => (msg && (submitted || touched.has(id)) ? msg : undefined);

  async function submit() {
    if (submitting.current || !draft || !v) return;
    setSubmitted(true);
    setError("");
    if (!v.result || !v.payload) {
      const msg = v.errors.form ?? `Please fix the ${v.errors.count} highlighted field${v.errors.count === 1 ? "" : "s"}.`;
      setError(msg);
      toast.error(msg);
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }

    submitting.current = true;
    setBusy(true);
    const done = (id: string, invoice?: string) => {
      dirty.current = false;
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {}
      toast.success(invoice ? `Bill ${invoice} saved successfully.` : "Bill saved successfully.");
      router.push(`/bills/${id}/preview${settings?.autoPreview === false ? "" : "?auto=1"}`);
    };
    try {
      const { bill } = await api<{ bill: BillDto }>("/api/bills", { method: "POST", json: v.payload });
      done(bill.id, bill.invoiceNumber);
    } catch (e) {
      let msg = e instanceof Error ? e.message : "Could not save the bill";
      // After a network failure the save may still have succeeded: ask the server before retrying.
      if (e instanceof ApiError && e.status === 0) {
        try {
          const { bill } = await api<{ bill: { id: string; invoiceNumber: string } | null }>(`/api/bills?idempotencyKey=${draft.idempotencyKey}`);
          if (bill) return done(bill.id, bill.invoiceNumber);
          msg = "Connection problem: the bill was NOT saved. Your entries are kept; press Generate to retry.";
        } catch {
          msg = "Connection lost. Status unknown: do not re-enter the bill. Press Generate again (it will not create a duplicate).";
        }
      }
      setError(msg);
      toast.error(msg);
      submitting.current = false;
      setBusy(false);
    }
  }

  function clearForm() {
    if (dirty.current && !confirm("Clear the whole form?")) return;
    dirty.current = false;
    setSubmitted(false);
    setTouched(new Set());
    setError("");
    setDraft(freshDraft(settings?.defaultPayment ?? "CASH"));
    toast.info("Form cleared.");
  }

  if (!draft || !settings || !v) return error ? <div className="err">{error}</div> : <p className="text-sm text-slate-500">Loading...</p>;

  const r = v.result;
  const E = v.errors;
  const cls = (msg?: string) => (msg ? "!border-red-500 focus:!ring-red-200" : "");

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <section className="card grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="cn">Customer name (optional)</label>
            <input id="cn" value={draft.customerName} maxLength={80} onChange={(e) => update({ customerName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="cm">Mobile (optional)</label>
            <input
              id="cm" value={draft.customerMobile} inputMode="tel" maxLength={16}
              aria-invalid={!!show("mobile", E.mobile)} className={cls(show("mobile", E.mobile))}
              onBlur={() => touch("mobile")} onChange={(e) => update({ customerMobile: e.target.value.replace(/[^\d+\s-]/g, "") })}
            />
            <Err msg={show("mobile", E.mobile)} />
          </div>
          <div>
            <label htmlFor="ca">Address (optional)</label>
            <input id="ca" value={draft.customerAddress} maxLength={200} onChange={(e) => update({ customerAddress: e.target.value })} />
          </div>
        </section>

        <section className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Items ({draft.rows.length})</h2>
            <button className="btn" type="button" disabled={draft.rows.length >= LIMITS.maxItems} onClick={() => update({ rows: [...draft.rows, newRow()] })}>+ Add item</button>
          </div>
          {draft.rows.map((row, idx) => {
            const line = r?.items[idx];
            const re = E.rows[row.key] ?? {};
            const id = (f: string) => `${row.key}.${f}`;
            const name = show(id("name"), re.name);
            const qty = show(id("qty"), re.qty);
            const rate = show(id("rate"), re.rate);
            const disc = show(id("discount"), re.discount);
            return (
              <div key={row.key} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 sm:col-span-6">
                    <label>Item name *</label>
                    <input
                      aria-invalid={!!name} className={cls(name)} value={row.itemName} maxLength={120}
                      onBlur={() => touch(id("name"))} onChange={(e) => updateRow(row.key, { itemName: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); if (draft.rows.length < LIMITS.maxItems) update({ rows: [...draft.rows, newRow()] }); }
                      }}
                    />
                    <Err msg={name} />
                  </div>
                  <div className="col-span-12 sm:col-span-3">
                    <label>Code</label>
                    <input value={row.itemCode} maxLength={40} onChange={(e) => updateRow(row.key, { itemCode: e.target.value })} />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label>Unit</label>
                    <select value={row.unit} onChange={(e) => { touch(id("qty")); updateRow(row.key, { unit: e.target.value }); }}>
                      {UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-12 items-start gap-2">
                  <div className="col-span-4 sm:col-span-2">
                    <label>Qty *</label>
                    <input aria-invalid={!!qty} className={cls(qty)} value={row.quantity} inputMode="decimal"
                      onBlur={() => touch(id("qty"))} onChange={(e) => updateRow(row.key, { quantity: e.target.value })} />
                    <Err msg={qty} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label>Rate ({"₹"}) *</label>
                    <input aria-invalid={!!rate} className={cls(rate)} value={row.rate} inputMode="decimal" placeholder="0.00"
                      onBlur={() => touch(id("rate"))} onChange={(e) => updateRow(row.key, { rate: e.target.value })} />
                    <Err msg={rate} />
                  </div>
                  <div className="col-span-4 sm:col-span-3">
                    <label>Discount</label>
                    <div className="flex gap-1">
                      <input aria-invalid={!!disc} className={cls(disc)} value={row.discount} inputMode="decimal"
                        onBlur={() => touch(id("discount"))} onChange={(e) => updateRow(row.key, { discount: e.target.value })} />
                      <select className="!w-16" value={row.discountType} onChange={(e) => { touch(id("discount")); updateRow(row.key, { discountType: e.target.value as DiscountType }); }}>
                        <option value="FIXED">{"₹"}</option>
                        <option value="PERCENT">%</option>
                      </select>
                    </div>
                    <Err msg={disc} />
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
                  <button type="button" className="btn !px-2 !py-0.5 text-xs" disabled={draft.rows.length >= LIMITS.maxItems} onClick={() => {
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
                <input aria-invalid={!!show("bd", E.billDiscount)} className={cls(show("bd", E.billDiscount))} value={draft.billDiscount} inputMode="decimal"
                  onBlur={() => touch("bd")} onChange={(e) => update({ billDiscount: e.target.value })} />
                <select className="!w-16" value={draft.billDiscountType} onChange={(e) => { touch("bd"); update({ billDiscountType: e.target.value as DiscountType }); }}>
                  <option value="FIXED">{"₹"}</option>
                  <option value="PERCENT">%</option>
                </select>
              </div>
              <Err msg={show("bd", E.billDiscount)} />
            </div>
            <div>
              <label>Other charges</label>
              <input aria-invalid={!!show("oc", E.otherCharges)} className={cls(show("oc", E.otherCharges))} value={draft.otherCharges} inputMode="decimal"
                onBlur={() => touch("oc")} onChange={(e) => update({ otherCharges: e.target.value })} />
              <Err msg={show("oc", E.otherCharges)} />
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
            <p className="text-sm text-slate-500">{E.form ?? "Totals appear once all fields are valid."}</p>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Payment</h2>
          <div>
            <label>Method</label>
            <select value={draft.paymentMethod} onChange={(e) => { touch("ap"); update({ paymentMethod: e.target.value }); }}>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm font-normal">
            <input type="checkbox" checked={draft.payFull} onChange={(e) => update({ payFull: e.target.checked, amountPaid: "" })} /> Paid in full
          </label>
          {!draft.payFull && (
            <div>
              <label>Amount received ({"₹"})</label>
              <input aria-invalid={!!show("ap", E.amountPaid)} className={cls(show("ap", E.amountPaid))} value={draft.amountPaid} inputMode="decimal" placeholder="0.00"
                onBlur={() => touch("ap")} onChange={(e) => update({ amountPaid: e.target.value })} />
              <Err msg={show("ap", E.amountPaid)} />
            </div>
          )}
          {r && (
            <div className="space-y-1 text-sm">
              <S k="Paid" v={formatINR(r.amountPaid)} />
              {r.changeGiven > 0 && <S k="Change to return" v={formatINR(r.changeGiven)} />}
              <S k="Balance due" v={formatINR(r.balanceDue)} />
              <S k="Status" v={r.paymentStatus === "PAID" ? "Paid" : r.paymentStatus === "PARTIAL" ? "Partial" : "Unpaid"} />
            </div>
          )}
        </section>

        {error && <div className="err" role="alert">{error}</div>}
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={submit}>
            {busy ? "Saving..." : "Generate bill"}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={clearForm}>Clear</button>
        </div>
      </aside>
    </div>
  );
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

function S({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
