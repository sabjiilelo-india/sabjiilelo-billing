import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

type Ctx = { params: Promise<{ id: string }> };

/** Records that a receipt was sent to the printer. Never modifies the bill itself. */
export const POST = route<Ctx>(async (_req, ctx, session) => {
  const { id } = await ctx.params;
  const bill = await prisma.bill.findUnique({ where: { id }, select: { id: true } });
  if (!bill) throw new HttpError(404, "Bill not found");
  const settings = await getSettings();
  await prisma.printLog.create({ data: { billId: id, userId: session.username, paperSize: settings.paperSize } });
  return NextResponse.json({ ok: true });
});
