"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { api, formatDateTime, qs } from "@/lib/client";
import { rupeesToPaise } from "@/lib/money";
import { PAYMENT_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";

interface Row {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerMobile: string;
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxAmount: number;
  grandTotal: number;
  paymentMethod: string;
  paymentStatus: string;
  billStatus: string;
  _count: { items: number };
}

const EMPTY = { q: "", range: "", from: "", to: "", minAmount: "", maxAmount: "", method: "", status: "", paymentStatus: "", sort: "newest" };
const PAGE_SIZE = 20;

export default function BillsPage() {
  const toast = useToast();
  const [f, setF] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = await api<{ bills: Row[]; total: number }>(
        `/api/bills?${qs({ ...applied, range: applied.from || applied.to ? "custom" : applied.range, page, pageSize: PAGE_SIZE })}`,
      );
      setRows(d.bills);
      setTotal(d.total);
    } catch (e) {
      setRows([]);
      setTotal(0);
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const [submitted, setSubmitted] = useState(false);
  const fe: Partial<Record<"from" | "to" | "minAmount" | "maxAmount" | "q", string>> = {};
  const min = f.minAmount.trim() ? rupeesToPaise(f.minAmount) : null;
  const max = f.maxAmount.trim() ? rupeesToPaise(f.maxAmount) : null;
  if (f.q.length > 100) fe.q = "At most 100 characters";
  if (f.from && f.to && f.from > f.to) fe.to = "End date must not be before start date";
  if (min !== null && (Number.isNaN(min) || min < 0)) fe.minAmount = "Enter a valid amount";
  if (max !== null && (Number.isNaN(max) || max < 0)) fe.maxAmount = "Enter a valid amount";
  if (!fe.minAmount && !fe.maxAmount && min !== null && max !== null && min > max) fe.maxAmount = "Must not be less than minimum";

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    setSubmitted(true);
    const n = Object.keys(fe).length;
    if (n) {
      setError("");
      toast.error(Object.values(fe)[0]!);
      return;
    }
    setError("");
    setPage(1);
    setApplied(f);
  }
  const bad = (k: keyof typeof fe) => (submitted && fe[k] ? { "aria-invalid": true, className: "!border-red-500 focus:!ring-red-200" } : {});
  const msg = (k: keyof typeof fe) => (submitted && fe[k] ? <p className="mt-1 text-xs text-red-600">{fe[k]}</p> : null);
  const set = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Bill history</h1>
        <Link href="/billing/new" className="btn btn-primary">New bill</Link>
      </div>

      <form onSubmit={apply} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <label>Search (invoice, customer, mobile, item name/code)</label>
          <input {...bad("q")} value={f.q} onChange={(e) => set("q", e.target.value)} placeholder="Search..." />{msg("q")}
        </div>
        <div>
          <label>Date range</label>
          <select value={f.range} onChange={(e) => setF((p) => ({ ...p, range: e.target.value, from: "", to: "" }))}>
            <option value="">All time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="last30">Last 30 days</option>
            <option value="thisWeek">This week</option>
            <option value="lastWeek">Last week</option>
            <option value="thisMonth">This month</option>
            <option value="lastMonth">Last month</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label>From</label><input type="date" value={f.from} onChange={(e) => setF((p) => ({ ...p, from: e.target.value, range: "" }))} /></div>
          <div><label>To</label><input {...bad("to")} type="date" min={f.from || undefined} value={f.to} onChange={(e) => setF((p) => ({ ...p, to: e.target.value, range: "" }))} />{msg("to")}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label>Min amount</label><input {...bad("minAmount")} value={f.minAmount} inputMode="decimal" maxLength={12} onChange={(e) => set("minAmount", e.target.value)} />{msg("minAmount")}</div>
          <div><label>Max amount</label><input {...bad("maxAmount")} value={f.maxAmount} inputMode="decimal" maxLength={12} onChange={(e) => set("maxAmount", e.target.value)} />{msg("maxAmount")}</div>
        </div>
        <div>
          <label>Payment method</label>
          <select value={f.method} onChange={(e) => set("method", e.target.value)}>
            <option value="">All</option>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label>Bill status</label>
          <select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="">All</option>
            <option value="COMPLETED">Completed</option>
            <option value="VOIDED">Voided</option>
          </select>
        </div>
        <div>
          <label>Payment status</label>
          <select value={f.paymentStatus} onChange={(e) => set("paymentStatus", e.target.value)}>
            <option value="">All</option>
            <option value="PAID">Paid</option>
            <option value="PARTIAL">Partial</option>
            <option value="UNPAID">Unpaid</option>
          </select>
        </div>
        <div>
          <label>Sort</label>
          <select value={f.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="amountDesc">Highest amount</option>
            <option value="amountAsc">Lowest amount</option>
            <option value="invoiceAsc">Invoice no. ascending</option>
            <option value="invoiceDesc">Invoice no. descending</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn btn-primary">Apply</button>
          <button type="button" className="btn" onClick={() => { setF(EMPTY); setApplied(EMPTY); setPage(1); setError(""); setSubmitted(false); }}>Reset</button>
        </div>
      </form>

      {error && <div className="err">{error}</div>}

      <div className="card overflow-x-auto !p-0">
        <table className="w-full">
          <thead className="border-b bg-slate-50">
            <tr>
              {["Invoice", "Date", "Customer", "Mobile", "Items", "Subtotal", "Discount", "Tax", "Total", "Method", "Payment", "Status", ""].map((h) => (
                <th key={h} className="th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className="td font-medium"><Link className="text-brand-800 hover:underline" href={`/bills/${b.id}`}>{b.invoiceNumber}</Link></td>
                <td className="td whitespace-nowrap">{formatDateTime(b.invoiceDate)}</td>
                <td className="td">{b.customerName || "Walk-in"}</td>
                <td className="td">{b.customerMobile || "-"}</td>
                <td className="td">{b._count.items}</td>
                <td className="td">{formatINR(b.subtotal)}</td>
                <td className="td">{formatINR(b.itemDiscount + b.billDiscount)}</td>
                <td className="td">{formatINR(b.taxAmount)}</td>
                <td className="td font-semibold">{formatINR(b.grandTotal)}</td>
                <td className="td">{PAYMENT_LABELS[b.paymentMethod] ?? b.paymentMethod}</td>
                <td className="td capitalize">{b.paymentStatus.toLowerCase()}</td>
                <td className="td">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${b.billStatus === "VOIDED" ? "bg-red-100 text-red-700" : "bg-brand-100 text-brand-800"}`}>
                    {b.billStatus === "VOIDED" ? "Voided" : "Completed"}
                  </span>
                </td>
                <td className="td whitespace-nowrap">
                  <Link className="btn !px-2 !py-0.5 text-xs" href={`/bills/${b.id}`}>View</Link>{" "}
                  <Link className="btn !px-2 !py-0.5 text-xs" href={`/bills/${b.id}/preview`}>Print</Link>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={13} className="td py-8 text-center text-slate-500">No bills match your filters.</td></tr>
            )}
            {loading && <tr><td colSpan={13} className="td py-8 text-center text-slate-500">Loading...</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{total} bill{total === 1 ? "" : "s"}</span>
        <div className="flex items-center gap-2">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pages}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
