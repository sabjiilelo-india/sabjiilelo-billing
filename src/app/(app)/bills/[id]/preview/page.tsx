"use client";

import { Suspense, use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReceiptView from "@/components/ReceiptView";
import { api } from "@/lib/client";
import type { BillDto, SettingsDto } from "@/lib/types";

function Preview({ id }: { id: string }) {
  const auto = useSearchParams().get("auto") === "1";
  const [bill, setBill] = useState<BillDto | null>(null);
  const [settings, setSettings] = useState<SettingsDto | null>(null);
  const [paper, setPaper] = useState<58 | 80>(80);
  const [error, setError] = useState("");
  const autoDone = useRef(false);

  useEffect(() => {
    Promise.all([api<{ bill: BillDto }>(`/api/bills/${id}`), api<{ settings: SettingsDto }>("/api/settings")])
      .then(([b, s]) => {
        setBill(b.bill);
        setSettings(s.settings);
        setPaper(s.settings.paperSize);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  function print() {
    if (!bill || !settings) return;
    // Logging is best effort: a failure here must never block printing or touch the saved bill.
    api(`/api/bills/${id}/print`, { method: "POST" }).catch(() => {});
    window.print();
  }

  useEffect(() => {
    if (auto && bill && settings && !autoDone.current) {
      autoDone.current = true;
      setTimeout(print, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, bill, settings]);

  if (error) return <div className="err">{error}</div>;
  if (!bill || !settings) return <p className="text-sm text-slate-500">Loading...</p>;

  const copies = Math.max(1, settings.copies);
  return (
    <div className="space-y-4">
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 0; } #receipt-root { width: ${paper}mm; } }`}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="page-title mr-auto">Receipt {bill.invoiceNumber}</h1>
        <select className="!w-auto" value={paper} onChange={(e) => setPaper(Number(e.target.value) as 58 | 80)}>
          <option value={80}>80 mm</option>
          <option value={58}>58 mm</option>
        </select>
        <button className="btn btn-primary" onClick={print}>Print{copies > 1 ? ` (${copies} copies)` : ""}</button>
        <Link className="btn" href={`/bills/${id}`}>Bill details</Link>
        <Link className="btn" href="/billing/new">New bill</Link>
      </div>
      <p className="text-xs text-slate-500 print:hidden">
        The bill is saved. If printing fails or is cancelled, you can reprint it any time from Bill History.
      </p>
      <div className="rounded-lg border bg-slate-200 p-4 print:border-0 print:bg-transparent print:p-0">
        <div id="receipt-root">
          {Array.from({ length: copies }).map((_, i) => (
            <div key={i} className="receipt-copy">
              <ReceiptView bill={bill} paperSize={paper} fontSize={settings.fontSize} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <Preview id={id} />
    </Suspense>
  );
}
