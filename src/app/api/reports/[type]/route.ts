import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/lib/db";
import { DateRangeError, resolveRange, type RangePreset } from "@/lib/dates";
import { paiseToRupees } from "@/lib/money";
import { dailySeries, summarize } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

type Ctx = { params: Promise<{ type: string }> };

const TYPES = ["sales", "payments", "discounts", "tax", "cancelled"];
const R = paiseToRupees;

export const GET = route<Ctx>(async (req, ctx) => {
  const { type } = await ctx.params;
  if (!TYPES.includes(type)) throw new HttpError(404, "Unknown report");
  const sp = new URL(req.url).searchParams;
  const settings = await getSettings();
  const tz = settings.timeZone;

  const preset = (sp.get("range") ?? "thisMonth") as RangePreset;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const range = resolveRange(preset, from, to, tz);
  if (!range) throw new DateRangeError("Choose a date range");
  // Open-ended custom ranges would aggregate all history; require both ends.
  if (preset === "custom" && (!from || !to)) throw new DateRangeError("Choose both start and end dates");

  const [summary, days] = await Promise.all([summarize(range), dailySeries(range, tz)]);

  let header: string[] = [];
  let rows: (string | number)[][] = [];
  let cancelled: unknown[] = [];

  if (type === "sales") {
    header = ["Date", "Bills", "Gross sales", "Discounts", "Tax", "Net sales", "Collected", "Outstanding"];
    rows = days.map((d) => [d.day, d.bills, R(d.gross), R(d.discount), R(d.tax), R(d.net), R(d.collected), R(d.outstanding)]);
  } else if (type === "discounts") {
    header = ["Date", "Bills", "Gross sales", "Discounts"];
    rows = days.map((d) => [d.day, d.bills, R(d.gross), R(d.discount)]);
  } else if (type === "tax") {
    header = ["Date", "Bills", "Net sales", "Tax"];
    rows = days.map((d) => [d.day, d.bills, R(d.net), R(d.tax)]);
  } else if (type === "payments") {
    header = ["Payment method", "Bills", "Sales", "Collected"];
    rows = summary.byMethod.map((m) => [m.method, m.bills, R(m.sales), R(m.collected)]);
  } else {
    const list = await prisma.bill.findMany({
      where: { billStatus: "VOIDED", invoiceDate: { gte: range.gte, lt: range.lt } },
      orderBy: { voidedAt: "desc" },
      take: 1000,
      select: { id: true, invoiceNumber: true, invoiceDate: true, grandTotal: true, voidReason: true, voidedAt: true },
    });
    cancelled = list;
    header = ["Invoice", "Invoice date", "Amount", "Reason", "Cancelled at"];
    rows = list.map((b) => [b.invoiceNumber, b.invoiceDate.toISOString(), R(b.grandTotal), b.voidReason ?? "", b.voidedAt?.toISOString() ?? ""]);
  }

  if (sp.get("format") === "csv") {
    return new NextResponse(toCsv([header, ...rows]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-report.csv"`,
      },
    });
  }
  return NextResponse.json({ type, summary, days, cancelled, header, rows });
});
