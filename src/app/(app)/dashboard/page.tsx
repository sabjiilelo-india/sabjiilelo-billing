"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api, formatDateTime } from "@/lib/client";
import { PAYMENT_LABELS } from "@/lib/constants";
import { formatINR } from "@/lib/money";

interface Stats {
  date: string;
  todaySales: number;
  todayBills: number;
  averageBill: number;
  monthSales: number;
  cancelledBills: number;
  totalTransactions: number;
  paymentSummary: { method: string; bills: number; collected: number }[];
  daily: { day: string; net: number }[];
  monthly: { month: string; net: number }[];
}
interface Recent {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  grandTotal: number;
  paymentMethod: string;
  billStatus: string;
}

export default function DashboardPage() {
  const [date, setDate] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    Promise.all([
      api<Stats>(`/api/dashboard/stats${date ? `?date=${date}` : ""}`),
      api<{ bills: Recent[] }>("/api/dashboard/recent-bills"),
    ])
      .then(([s, r]) => { setStats(s); setRecent(r.bills); })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the dashboard"));
  }, [date]);

  const cards = stats && [
    ["Sales", formatINR(stats.todaySales)],
    ["Bills", String(stats.todayBills)],
    ["Average bill", formatINR(stats.averageBill)],
    ["This month", formatINR(stats.monthSales)],
    ["Cancelled", String(stats.cancelledBills)],
    ["All-time transactions", String(stats.totalTransactions)],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="page-title mr-auto">Dashboard</h1>
        <input type="date" className="!w-auto" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Reporting date" />
        <Link href="/billing/new" className="btn btn-primary">Create bill</Link>
        <Link href="/bills" className="btn">All bills</Link>
      </div>
      {error && <div className="err">{error}</div>}
      {stats && (
        <>
          <p className="text-sm text-slate-500">Figures for {stats.date}; completed bills only.</p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {cards!.map(([k, v]) => (
              <div key={k} className="card">
                <div className="text-xs text-slate-500">{k}</div>
                <div className="mt-1 text-lg font-semibold">{v}</div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-2 font-semibold">Daily sales (last 30 days)</h2>
              <Chart data={stats.daily.map((d) => ({ label: d.day.slice(5), value: d.net / 100 }))} />
            </section>
            <section className="card">
              <h2 className="mb-2 font-semibold">Monthly sales</h2>
              <Chart data={stats.monthly.map((d) => ({ label: d.month, value: d.net / 100 }))} />
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-2 font-semibold">Payment methods (today)</h2>
              {stats.paymentSummary.length === 0 ? <p className="text-sm text-slate-500">No payments yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {stats.paymentSummary.map((p) => (
                    <li key={p.method} className="flex justify-between"><span>{PAYMENT_LABELS[p.method] ?? p.method} ({p.bills})</span><span>{formatINR(p.collected)}</span></li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <h2 className="mb-2 font-semibold">Recent bills</h2>
              {recent.length === 0 ? <p className="text-sm text-slate-500">No bills yet.</p> : (
                <ul className="divide-y text-sm">
                  {recent.map((b) => (
                    <li key={b.id} className="flex justify-between py-1.5">
                      <Link className="text-brand-800 hover:underline" href={`/bills/${b.id}`}>{b.invoiceNumber}</Link>
                      <span className="text-slate-500">{formatDateTime(b.invoiceDate)}</span>
                      <span className={b.billStatus === "VOIDED" ? "text-red-600 line-through" : ""}>{formatINR(b.grandTotal)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function Chart({ data }: { data: { label: string; value: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-slate-500">No sales data yet.</p>;
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" fontSize={11} />
          <YAxis fontSize={11} width={50} />
          <Tooltip formatter={(v) => ["₹" + Number(v).toFixed(2), "Sales"]} />
          <Bar dataKey="value" fill="#047857" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
