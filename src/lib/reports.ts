import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { Range } from "./dates";

const completedInRange = (r: Range): Prisma.BillWhereInput => ({
  billStatus: "COMPLETED",
  invoiceDate: { gte: r.gte, lt: r.lt },
});

type SumRow = Record<string, bigint | null>;

export async function summarize(r: Range) {
  // One aggregate query (completed + voided together) and one grouped query, run in parallel.
  const [aggRows, byMethod] = await Promise.all([
    prisma.$queryRaw<SumRow[]>`
      SELECT
        count(*) FILTER (WHERE "billStatus" = 'COMPLETED') AS done,
        count(*) FILTER (WHERE "billStatus" = 'VOIDED') AS voided,
        sum("grandTotal") FILTER (WHERE "billStatus" = 'VOIDED') AS "voidedValue",
        sum("subtotal") FILTER (WHERE "billStatus" = 'COMPLETED') AS subtotal,
        sum("itemDiscount") FILTER (WHERE "billStatus" = 'COMPLETED') AS "itemDiscount",
        sum("billDiscount") FILTER (WHERE "billStatus" = 'COMPLETED') AS "billDiscount",
        sum("taxAmount") FILTER (WHERE "billStatus" = 'COMPLETED') AS tax,
        sum("cgst") FILTER (WHERE "billStatus" = 'COMPLETED') AS cgst,
        sum("sgst") FILTER (WHERE "billStatus" = 'COMPLETED') AS sgst,
        sum("igst") FILTER (WHERE "billStatus" = 'COMPLETED') AS igst,
        sum("otherCharges") FILTER (WHERE "billStatus" = 'COMPLETED') AS "otherCharges",
        sum("roundOff") FILTER (WHERE "billStatus" = 'COMPLETED') AS "roundOff",
        sum("grandTotal") FILTER (WHERE "billStatus" = 'COMPLETED') AS net,
        sum("amountPaid") FILTER (WHERE "billStatus" = 'COMPLETED') AS collected,
        sum("balanceDue") FILTER (WHERE "billStatus" = 'COMPLETED') AS outstanding
      FROM "Bill"
      WHERE "invoiceDate" >= ${r.gte} AND "invoiceDate" < ${r.lt}`,
    prisma.bill.groupBy({
      by: ["paymentMethod"],
      where: completedInRange(r),
      _count: true,
      _sum: { amountPaid: true, grandTotal: true },
    }),
  ]);
  const a = aggRows[0];
  const n = (k: string) => Number(a[k] ?? 0);
  return {
    totalInvoices: n("done") + n("voided"),
    completedInvoices: n("done"),
    cancelledInvoices: n("voided"),
    cancelledValue: n("voidedValue"),
    grossSales: n("subtotal"),
    discounts: n("itemDiscount") + n("billDiscount"),
    itemDiscount: n("itemDiscount"),
    billDiscount: n("billDiscount"),
    tax: n("tax"),
    cgst: n("cgst"),
    sgst: n("sgst"),
    igst: n("igst"),
    otherCharges: n("otherCharges"),
    roundOff: n("roundOff"),
    netSales: n("net"),
    collected: n("collected"),
    outstanding: n("outstanding"),
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
