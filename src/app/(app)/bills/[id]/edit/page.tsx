"use client";

import { use, useEffect, useState } from "react";
import BillForm from "@/components/BillForm";
import { api } from "@/lib/client";
import type { BillDto } from "@/lib/types";

export default function EditBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [bill, setBill] = useState<BillDto | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ bill: BillDto }>(`/api/bills/${id}`)
      .then((d) => (d.bill.billStatus === "VOIDED" ? setError("A voided bill cannot be edited.") : setBill(d.bill)))
      .catch((e) => setError(e.message));
  }, [id]);

  return (
    <div className="space-y-4">
      <h1 className="page-title">Edit bill {bill?.invoiceNumber}</h1>
      {error ? <div className="err">{error}</div> : bill ? <BillForm bill={bill} /> : <p className="text-sm text-slate-500">Loading...</p>}
    </div>
  );
}
