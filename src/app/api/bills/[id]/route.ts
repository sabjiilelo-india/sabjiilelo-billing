import { NextResponse } from "next/server";
import { HttpError, route } from "@/lib/api";
import { prisma } from "@/lib/db";

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
