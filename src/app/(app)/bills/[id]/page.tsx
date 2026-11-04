"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { api, formatDateTime } from "@/lib/client";
import { PAYMENT_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";
import type { BillDto } from "@/lib/types";

interface Audit {
  id: string;
  action: string;
  userId: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export default function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const [bill, setBill] = useState<BillDto | null>(null);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [error, setError] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [reasonError, setReasonError] = useState("");

  const load = useCallback(() => {
    api<{ bill: BillDto; audits: Audit[] }>(`/api/bills/${id}`)
      .then((d) => { setBill(d.bill); setAudits(d.audits); })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  async function doVoid() {
    if (reason.trim().length < 3) {
      setReasonError("Enter a cancellation reason (at least 3 characters)");
      return;
    }
    setReasonError("");
    setBusy(true);
    setError("");
    try {
      await api(`/api/bills/${id}/void`, { method: "POST", json: { reason } });
      setVoiding(false);
      setReason("");
      toast.success("Bill voided. It stays in history marked as voided.");
      load();
    } catch (e) {
      const m = e instanceof Error ? e.message : "Could not void the bill";
      setError(m);
      toast.error(m);
    } finally {
      setBusy(false);
    }
  }

  if (!bill) return error ? <div className="err">{error}</div> : <p className="text-sm text-slate-500">Loading...</p>;
  const voided = bill.billStatus === "VOIDED";
  const tz = bill.shopSnapshot.timeZone;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title mr-auto">
          {bill.invoiceNumber}{" "}
          <span className={`ml-2 rounded px-2 py-0.5 text-xs ${voided ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-800"}`}>
            {voided ? "Voided" : "Completed"}
          </span>
        </h1>
        <Link className="btn btn-primary" href={`/bills/${id}/preview`}>Print / Reprint</Link>
        {!voided && <button className="btn btn-danger" onClick={() => setVoiding(true)}>Void bill</button>}
        <Link className="btn" href="/bills">Back</Link>
      </div>
      {error && <div className="err">{error}</div>}

      {voided && (
        <div className="err">
          Voided on {bill.voidedAt && formatDateTime(bill.voidedAt, tz)}. Reason: {bill.voidReason}
        </div>
      )}

      {voiding && (
        <div className="card space-y-2 border-red-300">
          <p className="text-sm font-medium">Void {bill.invoiceNumber}? This cannot be undone. The invoice stays in history marked as voided.</p>
          <label>Reason</label>
          <input value={reason} aria-invalid={!!reasonError} className={reasonError ? "!border-red-500" : ""} onChange={(e) => { setReason(e.target.value); setReasonError(""); }} maxLength={300} autoFocus />
          {reasonError && <p className="text-xs text-red-600">{reasonError}</p>}
          <div className="flex gap-2">
            <button className="btn btn-danger" disabled={busy} onClick={doVoid}>{busy ? "Voiding..." : "Confirm void"}</button>
            <button className="btn" onClick={() => { setVoiding(false); setError(""); }}>Keep bill</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Invoice</h2>
          <p>Date: {formatDateTime(bill.invoiceDate, tz)}</p>
          <p>Created by: {bill.createdBy?.username ?? "-"}</p>
          <p>Created: {formatDateTime(bill.createdAt, tz)}</p>
        </section>
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Customer</h2>
          <p>{bill.customerName || "Walk-in customer"}</p>
          {bill.customerMobile && <p>{bill.customerMobile}</p>}
          {bill.customerAddress && <p>{bill.customerAddress}</p>}
        </section>
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Payment</h2>
          <p>Method: {PAYMENT_LABELS[bill.paymentMethod] ?? bill.paymentMethod}</p>
          <p>Status: <span className="capitalize">{bill.paymentStatus.toLowerCase()}</span></p>
          <p>Paid: {formatINR(bill.amountPaid)}</p>
          <p>Balance due: {formatINR(bill.balanceDue)}</p>
        </section>
      </div>

      <section className="card overflow-x-auto !p-0">
        <table className="w-full">
          <thead className="border-b bg-slate-50">
            <tr>{["#", "Item", "Qty", "Rate", "Gross", "Discount", "Tax", "Total"].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          </thead>
          <tbody>
            {bill.items.map((it, i) => (
              <tr key={it.id} className="border-b last:border-0">
                <td className="td">{i + 1}</td>
                <td className="td">{it.itemName}{it.itemCode && <span className="text-slate-500"> ({it.itemCode})</span>}</td>
                <td className="td">{Number(it.quantity)} {it.unit}</td>
                <td className="td">{formatINR(it.unitPrice)}</td>
                <td className="td">{formatINR(it.grossAmount)}</td>
                <td className="td">{it.discountAmount ? `-${formatINR(it.discountAmount)}${it.discountType === "PERCENT" ? ` (${it.discountValue / 100}%)` : ""}` : "-"}</td>
                <td className="td">{bill.taxEnabled ? `${formatINR(it.taxAmount)} (${it.taxRate / 100}%)` : "-"}</td>
                <td className="td font-medium">{formatINR(it.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card ml-auto w-full space-y-1 text-sm md:order-2">
          <Line k="Subtotal" v={formatINR(bill.subtotal)} />
          <Line k="Item discount" v={"-" + formatINR(bill.itemDiscount)} />
          <Line k="Bill discount" v={"-" + formatINR(bill.billDiscount)} />
          {bill.taxEnabled && <Line k="Taxable amount" v={formatINR(bill.taxableAmount)} />}
          {bill.taxEnabled && (bill.igst > 0 ? <Line k="IGST" v={formatINR(bill.igst)} /> : <><Line k="CGST" v={formatINR(bill.cgst)} /><Line k="SGST" v={formatINR(bill.sgst)} /></>)}
          <Line k="Other charges" v={formatINR(bill.otherCharges)} />
          <Line k="Round off" v={formatINR(bill.roundOff)} />
          <div className="flex justify-between border-t pt-2 text-lg font-bold"><span>Grand total</span><span>{formatINR(bill.grandTotal)}</span></div>
        </section>
        <section className="card space-y-3 text-sm md:order-1">
          <div>
            <h2 className="mb-1 font-semibold">Print history</h2>
            {bill.printLogs?.length ? (
              <ul className="space-y-0.5">{bill.printLogs.map((p) => <li key={p.id}>{formatDateTime(p.createdAt, tz)} - {p.userId} ({p.paperSize}mm)</li>)}</ul>
            ) : <p className="text-slate-500">Not printed yet.</p>}
          </div>
          <div>
            <h2 className="mb-1 font-semibold">Audit trail</h2>
            <ul className="space-y-0.5">
              {audits.map((a) => (
                <li key={a.id}>{formatDateTime(a.createdAt, tz)} - {a.action.replace(/_/g, " ").toLowerCase()}{a.action === "BILL_VOIDED" && a.details ? ` (${String(a.details.reason)})` : ""}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-slate-500">{k}</span><span>{v}</span></div>;
}
