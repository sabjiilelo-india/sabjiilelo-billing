import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { DateRangeError, parseYmd, resolveRange, startOfDayUtc, todayInTz } from "@/lib/dates";
import { dailySeries, summarize } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const { timeZone: tz } = await getSettings();

  // Optional reporting date (YYYY-MM-DD); defaults to today in the shop time zone.
  const dateStr = sp.get("date");
  const ymd = dateStr ? parseYmd(dateStr) : todayInTz(tz);
  if (!ymd) throw new DateRangeError("Invalid date");
  const dayStart = startOfDayUtc(ymd.y, ymd.m, ymd.d, tz);
  const dayEnd = startOfDayUtc(ymd.y, ymd.m, ymd.d + 1, tz);
  const monthStart = startOfDayUtc(ymd.y, ymd.m, 1, tz);
  const monthEnd = startOfDayUtc(ymd.y, ymd.m + 1, 1, tz);

  const [today, month, totalTransactions, last30] = await Promise.all([
    summarize({ gte: dayStart, lt: dayEnd }),
    summarize({ gte: monthStart, lt: monthEnd }),
    prisma.bill.count(),
    dailySeries(resolveRange("last30", undefined, undefined, tz)!, tz),
  ]);

  // Monthly sales for the last 12 months.
  const monthly = await prisma.$queryRaw<{ month: string; net: bigint }[]>`
    SELECT to_char(date_trunc('month', "invoiceDate" AT TIME ZONE ${tz}), 'YYYY-MM') AS month,
           COALESCE(sum("grandTotal"), 0) AS net
    FROM "Bill"
    WHERE "billStatus" = 'COMPLETED' AND "invoiceDate" >= ${startOfDayUtc(ymd.y - 1, ymd.m + 1, 1, tz)}
    GROUP BY 1 ORDER BY 1`;

  return NextResponse.json({
    date: `${ymd.y}-${String(ymd.m).padStart(2, "0")}-${String(ymd.d).padStart(2, "0")}`,
    todaySales: today.netSales,
    todayBills: today.completedInvoices,
    averageBill: today.completedInvoices ? Math.round(today.netSales / today.completedInvoices) : 0,
    monthSales: month.netSales,
    cancelledBills: today.cancelledInvoices,
    totalTransactions,
    paymentSummary: today.byMethod,
    daily: last30.map((d) => ({ day: d.day, net: d.net })),
    monthly: monthly.map((m) => ({ month: m.month, net: Number(m.net) })),
  });
});
