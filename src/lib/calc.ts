// All money is integer paise. Quantities are decimals with up to 3 places.
// Percentages (discount, tax) are basis points (1800 = 18%).

export type DiscountType = "FIXED" | "PERCENT";

export interface ItemInput {
  quantity: number;
  unitPrice: number; // paise
  discountType: DiscountType;
  discountValue: number; // paise (FIXED) or basis points (PERCENT)
  taxRate: number; // basis points
}

export interface ItemResult {
  grossAmount: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface BillInput {
  items: ItemInput[];
  billDiscountType: DiscountType;
  billDiscountValue: number;
  otherCharges: number; // paise
  taxEnabled: boolean;
  taxMode: "INTRA" | "INTER";
  roundOff: boolean;
  paymentMethod: string;
  amountPaid: number; // paise tendered
}

export interface BillResult {
  items: ItemResult[];
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableAmount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  otherCharges: number;
  roundOff: number;
  grandTotal: number;
  amountPaid: number; // credited against the bill (capped at grandTotal)
  changeGiven: number;
  balanceDue: number;
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
}

export const LIMITS = {
  maxQuantity: 10000,
  maxUnitPrice: 100_000_000, // Rs 10,00,000
  maxItems: 200,
};

export class CalcError extends Error {}

/** Round half up for non-negative integers numerator/denominator. */
function divRound(n: number, d: number): number {
  return Math.floor((n * 2 + d) / (d * 2));
}

export function calcItem(i: ItemInput, taxEnabled: boolean): ItemResult {
  if (!(i.quantity > 0)) throw new CalcError("Quantity must be greater than zero");
  if (i.quantity > LIMITS.maxQuantity) throw new CalcError("Quantity is too large");
  if (!Number.isInteger(i.unitPrice) || i.unitPrice < 0) throw new CalcError("Rate must not be negative");
  if (i.unitPrice > LIMITS.maxUnitPrice) throw new CalcError("Rate is too large");
  const qtyMilli = Math.round(i.quantity * 1000);
  if (qtyMilli < 1) throw new CalcError("Quantity is too small");
  const gross = divRound(qtyMilli * i.unitPrice, 1000);

  let discount = 0;
  if (i.discountValue < 0) throw new CalcError("Discount must not be negative");
  if (i.discountType === "PERCENT") {
    if (i.discountValue > 10000) throw new CalcError("Discount cannot exceed 100%");
    discount = divRound(gross * i.discountValue, 10000);
  } else {
    discount = i.discountValue;
  }
  if (discount > gross) throw new CalcError("Discount cannot exceed the item amount");

  const taxable = gross - discount;
  const rate = taxEnabled ? i.taxRate : 0;
  if (rate < 0 || rate > 10000) throw new CalcError("Invalid tax rate");
  const tax = divRound(taxable * rate, 10000);
  return {
    grossAmount: gross,
    discountAmount: discount,
    taxableAmount: taxable,
    taxAmount: tax,
    lineTotal: taxable + tax,
  };
}

export function paymentStatusOf(grandTotal: number, paid: number): "PAID" | "PARTIAL" | "UNPAID" {
  if (paid >= grandTotal) return "PAID";
  if (paid <= 0) return "UNPAID";
  return "PARTIAL";
}

/**
 * Order of operations: line gross -> line discount -> line tax; the bill-level
 * discount is applied to the sum of line totals (after tax), then other charges,
 * then optional rounding to the nearest rupee.
 */
export function calcBill(b: BillInput): BillResult {
  if (b.items.length === 0) throw new CalcError("Add at least one item");
  if (b.items.length > LIMITS.maxItems) throw new CalcError(`A bill can have at most ${LIMITS.maxItems} items`);
  if (b.otherCharges < 0) throw new CalcError("Other charges must not be negative");
  if (b.amountPaid < 0) throw new CalcError("Payment must not be negative");

  const items = b.items.map((i) => calcItem(i, b.taxEnabled));
  const subtotal = items.reduce((s, i) => s + i.grossAmount, 0);
  const itemDiscount = items.reduce((s, i) => s + i.discountAmount, 0);
  const taxableAmount = items.reduce((s, i) => s + i.taxableAmount, 0);
  const taxAmount = items.reduce((s, i) => s + i.taxAmount, 0);
  const linesTotal = taxableAmount + taxAmount;

  if (b.billDiscountValue < 0) throw new CalcError("Discount must not be negative");
  let billDiscount: number;
  if (b.billDiscountType === "PERCENT") {
    if (b.billDiscountValue > 10000) throw new CalcError("Discount cannot exceed 100%");
    billDiscount = divRound(linesTotal * b.billDiscountValue, 10000);
  } else {
    billDiscount = b.billDiscountValue;
  }
  if (billDiscount > linesTotal) throw new CalcError("Bill discount cannot exceed the bill total");

  const cgst = b.taxMode === "INTRA" ? Math.floor(taxAmount / 2) : 0;
  const sgst = b.taxMode === "INTRA" ? taxAmount - cgst : 0;
  const igst = b.taxMode === "INTER" ? taxAmount : 0;

  const raw = linesTotal - billDiscount + b.otherCharges;
  const grandTotal = b.roundOff ? divRound(raw, 100) * 100 : raw;
  const roundOff = grandTotal - raw;

  let amountPaid = b.amountPaid;
  let changeGiven = 0;
  if (amountPaid > grandTotal) {
    if (b.paymentMethod !== "CASH") throw new CalcError("Payment cannot exceed the bill total for non-cash methods");
    changeGiven = amountPaid - grandTotal;
    amountPaid = grandTotal;
  }
  return {
    items,
    subtotal,
    itemDiscount,
    billDiscount,
    taxableAmount,
    taxAmount,
    cgst,
    sgst,
    igst,
    otherCharges: b.otherCharges,
    roundOff,
    grandTotal,
    amountPaid,
    changeGiven,
    balanceDue: grandTotal - amountPaid,
    paymentStatus: paymentStatusOf(grandTotal, amountPaid),
  };
}
