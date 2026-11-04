import { Prisma } from "@prisma/client";
import { z } from "zod";
import { calcBill } from "./calc";
import { PAYMENT_METHODS } from "./constants";
import { HttpError } from "./api";
import { audit } from "./audit";
import { prisma } from "./db";
import { getSettings, shopSnapshot } from "./settings";

const int = z.number().int();

export const billSchema = z.object({
  idempotencyKey: z.string().uuid("Missing request key"),
  customerName: z.string().trim().max(80).default(""),
  customerMobile: z
    .string()
    .trim()
    .default("")
    .transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+?91)(?=\d{10}$)/, ""))
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "Enter a valid 10-digit mobile number"),
  customerAddress: z.string().trim().max(200).default(""),
  items: z
    .array(
      z.object({
        itemName: z.string().trim().min(1, "Item name is required").max(120),
        itemCode: z.string().trim().max(40).default(""),
        quantity: z.number().positive("Quantity must be greater than zero"),
        unit: z.string().trim().min(1).max(20),
        unitPrice: int.min(0, "Rate must not be negative"),
        discountType: z.enum(["FIXED", "PERCENT"]).default("FIXED"),
        discountValue: int.min(0).default(0),
        taxRate: int.min(0).max(10000).default(0),
      }),
    )
    .min(1, "Add at least one item"),
  billDiscountType: z.enum(["FIXED", "PERCENT"]).default("FIXED"),
  billDiscountValue: int.min(0).default(0),
  otherCharges: int.min(0).default(0),
  paymentMethod: z.enum(PAYMENT_METHODS),
  amountPaid: int.min(0, "Payment must not be negative"),
});

export type BillInputBody = z.infer<typeof billSchema>;

const billInclude = { items: { orderBy: { position: "asc" } }, payments: true } satisfies Prisma.BillInclude;

async function nextInvoiceNumber(tx: Prisma.TransactionClient, prefix: string) {
  // Single atomic upsert-increment; concurrent transactions serialize on the counter row.
  const rows = await tx.$queryRaw<{ lastSequence: number }[]>`
    INSERT INTO "InvoiceCounter" ("scope", "lastSequence", "updatedAt")
    VALUES (${prefix}, 1, now())
    ON CONFLICT ("scope") DO UPDATE
      SET "lastSequence" = "InvoiceCounter"."lastSequence" + 1, "updatedAt" = now()
    RETURNING "lastSequence"`;
  return `${prefix}${String(rows[0].lastSequence).padStart(4, "0")}`;
}

export async function createBill(body: BillInputBody, userId: string) {
  const existing = await prisma.bill.findUnique({ where: { idempotencyKey: body.idempotencyKey }, include: billInclude });
  if (existing) return { bill: existing, duplicate: true };

  const settings = await getSettings();
  const result = calcBill({
    items: body.items,
    billDiscountType: body.billDiscountType,
    billDiscountValue: body.billDiscountValue,
    otherCharges: body.otherCharges,
    taxEnabled: settings.taxEnabled,
    taxMode: settings.taxMode as "INTRA" | "INTER",
    roundOff: settings.roundOff,
    paymentMethod: body.paymentMethod,
    amountPaid: body.amountPaid,
  });

  try {
    const bill = await prisma.$transaction(async (tx) => {
      const invoiceNumber = await nextInvoiceNumber(tx, settings.invoicePrefix);
      const created = await tx.bill.create({
        data: {
          invoiceNumber,
          idempotencyKey: body.idempotencyKey,
          customerName: body.customerName,
          customerMobile: body.customerMobile,
          customerAddress: body.customerAddress,
          shopSnapshot: shopSnapshot(settings),
          subtotal: result.subtotal,
          itemDiscount: result.itemDiscount,
          billDiscount: result.billDiscount,
          taxableAmount: result.taxableAmount,
          cgst: result.cgst,
          sgst: result.sgst,
          igst: result.igst,
          taxAmount: result.taxAmount,
          otherCharges: result.otherCharges,
          roundOff: result.roundOff,
          grandTotal: result.grandTotal,
          paymentMethod: body.paymentMethod,
          amountPaid: result.amountPaid,
          balanceDue: result.balanceDue,
          changeGiven: result.changeGiven,
          paymentStatus: result.paymentStatus,
          taxEnabled: settings.taxEnabled,
          createdById: userId,
          items: {
            create: body.items.map((it, idx) => ({
              position: idx,
              itemName: it.itemName,
              itemCode: it.itemCode,
              quantity: it.quantity,
              unit: it.unit,
              unitPrice: it.unitPrice,
              discountType: it.discountType,
              discountValue: it.discountValue,
              discountAmount: result.items[idx].discountAmount,
              taxRate: settings.taxEnabled ? it.taxRate : 0,
              grossAmount: result.items[idx].grossAmount,
              taxableAmount: result.items[idx].taxableAmount,
              taxAmount: result.items[idx].taxAmount,
              lineTotal: result.items[idx].lineTotal,
            })),
          },
          payments: result.amountPaid > 0 ? { create: [{ method: body.paymentMethod, amount: result.amountPaid }] } : undefined,
        },
        include: billInclude,
      });
      await audit("BILL_CREATED", "Bill", created.id, userId, { invoiceNumber, grandTotal: created.grandTotal }, tx);
      return created;
    }, { maxWait: 20000, timeout: 30000 });
    return { bill, duplicate: false };
  } catch (e) {
    // A concurrent request with the same idempotency key won the race.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.bill.findUnique({ where: { idempotencyKey: body.idempotencyKey }, include: billInclude });
      if (again) return { bill: again, duplicate: true };
    }
    throw e;
  }
}

export async function voidBill(id: string, reason: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findUnique({ where: { id } });
    if (!bill) throw new HttpError(404, "Bill not found");
    if (bill.billStatus === "VOIDED") throw new HttpError(409, "Bill is already voided");
    const updated = await tx.bill.update({
      where: { id },
      data: { billStatus: "VOIDED", voidReason: reason, voidedById: userId, voidedAt: new Date() },
      include: billInclude,
    });
    await audit("BILL_VOIDED", "Bill", id, userId, { invoiceNumber: bill.invoiceNumber, reason }, tx);
    return updated;
  });
}
