import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { Range } from "./dates";

const completedInRange = (r: Range): Prisma.BillWhereInput => ({
  billStatus: "COMPLETED",
  invoiceDate: { gte: r.gte, lt: r.lt },
});

export async function summarize(r: Range) {
  const [done, voided, byMethod] = await Promise.all([
    prisma.bill.aggregate({
      where: completedInRange(r),
      _count: true,
      _sum: {
        subtotal: true, itemDiscount: true, billDiscount: true, taxAmount: true, cgst: true, sgst: true, igst: true,
        otherCharges: true, roundOff: true, grandTotal: true, amountPaid: true, balanceDue: true,
      },
    }),
    prisma.bill.aggregate({
      where: { billStatus: "VOIDED", invoiceDate: { gte: r.gte, lt: r.lt } },
      _count: true,
      _sum: { grandTotal: true },
    }),
    prisma.bill.groupBy({
      by: ["paymentMethod"],
      where: completedInRange(r),
      _count: true,
      _sum: { amountPaid: true, grandTotal: true },
    }),
  ]);
  const s = done._sum;
  return {
    totalInvoices: done._count + voided._count,
    completedInvoices: done._count,
    cancelledInvoices: voided._count,
    cancelledValue: voided._sum.grandTotal ?? 0,
    grossSales: s.subtotal ?? 0,
    discounts: (s.itemDiscount ?? 0) + (s.billDiscount ?? 0),
    itemDiscount: s.itemDiscount ?? 0,
    billDiscount: s.billDiscount ?? 0,
    tax: s.taxAmount ?? 0,
    cgst: s.cgst ?? 0,
    sgst: s.sgst ?? 0,
    igst: s.igst ?? 0,
    otherCharges: s.otherCharges ?? 0,
    roundOff: s.roundOff ?? 0,
    netSales: s.grandTotal ?? 0,
    collected: s.amountPaid ?? 0,
    outstanding: s.balanceDue ?? 0,
    byMethod: byMethod.map((m) => ({
      method: m.paymentMethod,
      bills: m._count,
      sales: m._sum.grandTotal ?? 0,
      collected: m._sum.amountPaid ?? 0,
    })),
  };
}

export interface DayRow {
  day: string;
  bills: number;
  gross: number;
  discount: number;
  tax: number;
  net: number;
  collected: number;
  outstanding: number;
}

/** Per-day totals for completed bills, bucketed by the shop's time zone. */
export async function dailySeries(r: Range, tz: string): Promise<DayRow[]> {
  const rows = await prisma.$queryRaw<
    { day: string; bills: bigint; gross: bigint; discount: bigint; tax: bigint; net: bigint; collected: bigint; outstanding: bigint }[]
  >`
    SELECT to_char(("invoiceDate" AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day,
           count(*) AS bills,
           COALESCE(sum("subtotal"), 0) AS gross,
           COALESCE(sum("itemDiscount" + "billDiscount"), 0) AS discount,
           COALESCE(sum("taxAmount"), 0) AS tax,
           COALESCE(sum("grandTotal"), 0) AS net,
           COALESCE(sum("amountPaid"), 0) AS collected,
           COALESCE(sum("balanceDue"), 0) AS outstanding
    FROM "Bill"
    WHERE "billStatus" = 'COMPLETED' AND "invoiceDate" >= ${r.gte} AND "invoiceDate" < ${r.lt}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((x) => ({
    day: x.day,
    bills: Number(x.bills),
    gross: Number(x.gross),
    discount: Number(x.discount),
    tax: Number(x.tax),
    net: Number(x.net),
    collected: Number(x.collected),
    outstanding: Number(x.outstanding),
  }));
}
