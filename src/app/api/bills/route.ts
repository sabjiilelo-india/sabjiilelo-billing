import { NextResponse } from "next/server";
import { readJson, route } from "@/lib/api";
import { buildBillOrder, buildBillWhere } from "@/lib/billQuery";
import { billSchema, createBill } from "@/lib/bills";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export const POST = route(async (req, _ctx, session) => {
  const body = billSchema.parse(await readJson(req));
  const { bill, duplicate } = await createBill(body, session.uid);
  return NextResponse.json({ bill, duplicate }, { status: duplicate ? 200 : 201 });
});

export const GET = route(async (req) => {
  const sp = new URL(req.url).searchParams;
  const settings = await getSettings();

  // Lookup by idempotency key lets the client confirm whether a timed-out save went through.
  const key = sp.get("idempotencyKey");
  if (key) {
    const bill = await prisma.bill.findUnique({ where: { idempotencyKey: key }, select: { id: true, invoiceNumber: true } });
    return NextResponse.json({ bill });
  }

  const where = buildBillWhere(sp, settings.timeZone);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize")) || 20));
  const [total, rows] = await Promise.all([
    prisma.bill.count({ where }),
    prisma.bill.findMany({
      where,
      orderBy: buildBillOrder(sp.get("sort")),
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, customerName: true, customerMobile: true,
        subtotal: true, itemDiscount: true, billDiscount: true, taxAmount: true, grandTotal: true,
        paymentMethod: true, paymentStatus: true, billStatus: true, balanceDue: true,
        _count: { select: { items: true } },
      },
    }),
  ]);
  return NextResponse.json({ total, page, pageSize, bills: rows });
});
