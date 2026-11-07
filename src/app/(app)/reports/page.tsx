"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/client";
import { PAYMENT_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";

interface Report {
  summary: {
    totalInvoices: number; completedInvoices: number; cancelledInvoices: number;
    grossSales: number; discounts: number; tax: number; netSales: number; collected: number; outstanding: number;
    byMethod: { method: string; bills: number; sales: number; collected: number }[];
  };
  header: string[];
  rows: (string | number)[][];
}

const TYPES = [
  ["sales", "Sales (daily)"], ["payments", "Payment methods"], ["discounts", "Discounts"], ["tax", "Tax"], ["cancelled", "Cancelled bills"],
];
const RANGES = [
  ["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 days"], ["last30", "Last 30 days"], ["thisWeek", "This week"],
  ["lastWeek", "Last week"], ["thisMonth", "This month"], ["lastMonth", "Last month"], ["custom", "Custom range"],
];

export default function ReportsPage() {
  const [type, setType] = useState("sales");
  const [range, setRange] = useState("thisMonth");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");

  const query = qs({ range, from: range === "custom" ? from : "", to: range === "custom" ? to : "" });

  const load = useCallback(async () => {
    setError("");
    if (range === "custom") {
      if (!from || !to) { setData(null); return setError("Choose both start and end dates"); }
      if (from > to) { setData(null); return setError("Start date must not be after end date"); }
    }
    try {
      setData(await api<Report>(`/api/reports/${type}?${query}`));
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load report");
    }
  }, [type, range, from, to, query]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const cards = s && [
    ["Total invoices", s.totalInvoices], ["Completed", s.completedInvoices], ["Cancelled", s.cancelledInvoices],
    ["Gross sales", formatINR(s.grossSales)], ["Discounts", formatINR(s.discounts)], ["Tax", formatINR(s.tax)],
    ["Net sales", formatINR(s.netSales)], ["Collected", formatINR(s.collected)], ["Outstanding", formatINR(s.outstanding)],
  ];

  return (
    <div className="space-y-4">
      <h1 className="page-title">Sales reports</h1>
      <div className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label>Report</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <div>
          <label>Period</label>
          <select value={range} onChange={(e) => setRange(e.target.value)}>{RANGES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        {range === "custom" && (
          <>
            <div><label>From</label><input type="date" max={to || undefined} aria-invalid={!from} className={!from ? "!border-red-500" : ""} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><label>To</label><input type="date" min={from || undefined} aria-invalid={!to || (!!from && from > to)} className={!to || (from && from > to) ? "!border-red-500" : ""} value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </>
        )}
        <div className="flex items-end">
          <a className={`btn ${data ? "" : "pointer-events-none opacity-50"}`} href={`/api/reports/${type}?${query}&format=csv`}>Export CSV</a>
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      {cards && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {cards.map(([k, v]) => (
            <div key={k as string} className="card"><div className="text-xs text-slate-500">{k}</div><div className="mt-1 text-lg font-semibold">{v}</div></div>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Net sales are the value of completed bills. Collected is cash actually received; outstanding is unpaid balance. Cancelled bills are excluded.</p>
      {s && s.byMethod.length > 0 && (
        <div className="card text-sm">
          <h2 className="mb-2 font-semibold">Collections by method</h2>
          <ul className="space-y-1">{s.byMethod.map((m) => <li key={m.method} className="flex justify-between"><span>{PAYMENT_LABELS[m.method] ?? m.method} ({m.bills})</span><span>{formatINR(m.collected)}</span></li>)}</ul>
        </div>
      )}
      {data && (
        <div className="card overflow-x-auto !p-0">
          <table className="w-full">
            <thead className="border-b bg-slate-50"><tr>{data.header.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className="td">{c}</td>)}</tr>)}
              {data.rows.length === 0 && <tr><td colSpan={data.header.length} className="td py-6 text-center text-slate-500">No transactions in this period.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
