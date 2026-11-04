import type { Prisma } from "@prisma/client";
import { DateRangeError, resolveRange, type RangePreset } from "./dates";
import { rupeesToPaise } from "./money";

const PRESETS = ["today", "yesterday", "last7", "last30", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "custom"];
const PAYMENT = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"];

export function buildBillWhere(sp: URLSearchParams, tz: string): Prisma.BillWhereInput {
  const and: Prisma.BillWhereInput[] = [];

  const q = sp.get("q")?.trim();
  if (q) {
    and.push({
      OR: [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { customerMobile: { contains: q } },
        { items: { some: { itemName: { contains: q, mode: "insensitive" } } } },
        { items: { some: { itemCode: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }

  const preset = sp.get("range") ?? undefined;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  if (preset && !PRESETS.includes(preset)) throw new DateRangeError("Invalid date filter");
  const range = resolveRange((preset as RangePreset | undefined) ?? (from || to ? "custom" : undefined), from, to, tz);
  if (range) and.push({ invoiceDate: { gte: range.gte, lt: range.lt } });

  const min = sp.get("minAmount");
  const max = sp.get("maxAmount");
  const minP = min ? rupeesToPaise(min) : null;
  const maxP = max ? rupeesToPaise(max) : null;
  if ((minP !== null && Number.isNaN(minP)) || (maxP !== null && Number.isNaN(maxP))) throw new DateRangeError("Invalid amount filter");
  if (minP !== null && maxP !== null && minP > maxP) throw new DateRangeError("Minimum amount must not exceed maximum");
  if (minP !== null || maxP !== null) {
    and.push({ grandTotal: { ...(minP !== null ? { gte: minP } : {}), ...(maxP !== null ? { lte: maxP } : {}) } });
  }

  const method = sp.get("method");
  if (method && PAYMENT.includes(method)) and.push({ paymentMethod: method });
  const status = sp.get("status");
  if (status === "COMPLETED" || status === "VOIDED") and.push({ billStatus: status });
  const ps = sp.get("paymentStatus");
  if (ps === "PAID" || ps === "PARTIAL" || ps === "UNPAID") and.push({ paymentStatus: ps });

  return and.length ? { AND: and } : {};
}

export function buildBillOrder(sort: string | null): Prisma.BillOrderByWithRelationInput[] {
  switch (sort) {
    case "oldest": return [{ invoiceDate: "asc" }];
    case "amountDesc": return [{ grandTotal: "desc" }];
    case "amountAsc": return [{ grandTotal: "asc" }];
    case "invoiceAsc": return [{ createdAt: "asc" }];
    case "invoiceDesc": return [{ createdAt: "desc" }];
    default: return [{ invoiceDate: "desc" }];
  }
}
