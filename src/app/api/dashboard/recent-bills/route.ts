import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { prisma } from "@/lib/db";

export const GET = route(async () => {
  const bills = await prisma.bill.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true, invoiceNumber: true, invoiceDate: true, customerName: true,
      grandTotal: true, paymentMethod: true, paymentStatus: true, billStatus: true,
    },
  });
  return NextResponse.json({ bills });
});
