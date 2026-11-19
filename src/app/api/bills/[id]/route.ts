import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { HttpError, readJson, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { billSchema, deleteBill, updateBill } from "@/lib/bills";
import { prisma } from "@/lib/db";
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "@/lib/rateLimit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, ctx) => {
  const { id } = await ctx.params;
  const bill = await prisma.bill.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      payments: true,
      printLogs: { orderBy: { createdAt: "desc" } },
      createdBy: { select: { username: true } },
    },
  });
  if (!bill) throw new HttpError(404, "Bill not found");
  const audits = await prisma.auditLog.findMany({
    where: { entity: "Bill", entityId: id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ bill, audits });
});

export const PUT = route<Ctx>(
  async (req, ctx, session) => {
    const { id } = await ctx.params;
    const body = billSchema.parse(await readJson(req));
    const bill = await updateBill(id, body, session.uid);
    return NextResponse.json({ bill: { id: bill.id, invoiceNumber: bill.invoiceNumber } });
  },
  { adminOnly: true },
);

const deleteSchema = z.object({ password: z.string().min(1, "Enter your admin password") });

export const DELETE = route<Ctx>(
  async (req, ctx, session) => {
    const { id } = await ctx.params;
    const { password } = deleteSchema.parse(await readJson(req));
    const key = `delete|${session.uid}`;
    if (await isLoginBlocked(key)) throw new HttpError(429, "Too many wrong passwords. Try again in 15 minutes.");
    const admin = await prisma.admin.findUnique({ where: { id: session.uid } });
    const ok = !!admin && admin.isActive && (await bcrypt.compare(password, admin.passwordHash));
    if (!ok) {
      await recordLoginFailure(key);
      await audit("BILL_DELETE_DENIED", "Bill", id, session.uid);
      throw new HttpError(403, "Incorrect admin password");
    }
    await clearLoginFailures(key);
    await deleteBill(id, session.uid);
    return NextResponse.json({ ok: true });
  },
  { adminOnly: true },
);
