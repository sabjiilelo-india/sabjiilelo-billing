import { describe, it, expect } from "vitest";
import { calcBill, CalcError, type BillInput } from "./calc";

const base: BillInput = {
  items: [{ quantity: 2, unitPrice: 15000, discountType: "FIXED", discountValue: 0, taxRate: 0 }],
  billDiscountType: "FIXED",
  billDiscountValue: 0,
  otherCharges: 0,
  taxEnabled: false,
  taxMode: "INTRA",
  roundOff: false,
  paymentMethod: "CASH",
  amountPaid: 0,
};

describe("calcBill", () => {
  it("computes a simple line", () => {
    const r = calcBill(base);
    expect(r.grandTotal).toBe(30000);
    expect(r.paymentStatus).toBe("UNPAID");
  });
  it("percent and fixed discounts", () => {
    const r = calcBill({ ...base, items: [{ ...base.items[0], discountType: "PERCENT", discountValue: 1000 }] });
    expect(r.itemDiscount).toBe(3000);
    expect(r.grandTotal).toBe(27000);
    const f = calcBill({ ...base, items: [{ ...base.items[0], discountValue: 5000 }] });
    expect(f.grandTotal).toBe(25000);
  });
  it("rejects discount above amount", () => {
    expect(() => calcBill({ ...base, items: [{ ...base.items[0], discountValue: 30001 }] })).toThrow(CalcError);
  });
  it("tax per item, ignored when disabled", () => {
    const items = [
      { ...base.items[0], taxRate: 1800 },
      { quantity: 1, unitPrice: 10000, discountType: "FIXED" as const, discountValue: 0, taxRate: 500 },
    ];
    expect(calcBill({ ...base, items }).taxAmount).toBe(0);
    const r = calcBill({ ...base, items, taxEnabled: true });
    expect(r.taxAmount).toBe(5400 + 500);
    expect(r.cgst + r.sgst).toBe(r.taxAmount);
    expect(r.grandTotal).toBe(40000 + 5900);
  });
  it("IGST mode", () => {
    const r = calcBill({ ...base, taxEnabled: true, taxMode: "INTER", items: [{ ...base.items[0], taxRate: 1800 }] });
    expect(r.igst).toBe(5400);
    expect(r.cgst).toBe(0);
  });
  it("decimal quantity", () => {
    const r = calcBill({ ...base, items: [{ ...base.items[0], quantity: 0.5, unitPrice: 9900 }] });
    expect(r.subtotal).toBe(4950);
  });
  it("round off", () => {
    const r = calcBill({ ...base, roundOff: true, items: [{ ...base.items[0], quantity: 1, unitPrice: 9950 }] });
    expect(r.grandTotal).toBe(10000);
    expect(r.roundOff).toBe(50);
  });
  it("payment status and change", () => {
    expect(calcBill({ ...base, amountPaid: 10000 }).paymentStatus).toBe("PARTIAL");
    expect(calcBill({ ...base, amountPaid: 10000 }).balanceDue).toBe(20000);
    expect(calcBill({ ...base, amountPaid: 30000 }).paymentStatus).toBe("PAID");
    const c = calcBill({ ...base, amountPaid: 50000 });
    expect(c.changeGiven).toBe(20000);
    expect(c.amountPaid).toBe(30000);
    expect(() => calcBill({ ...base, paymentMethod: "UPI", amountPaid: 50000 })).toThrow(CalcError);
  });
  it("validates quantity and rate", () => {
    expect(() => calcBill({ ...base, items: [{ ...base.items[0], quantity: 0 }] })).toThrow(CalcError);
    expect(() => calcBill({ ...base, items: [{ ...base.items[0], quantity: -1 }] })).toThrow(CalcError);
    expect(() => calcBill({ ...base, items: [{ ...base.items[0], unitPrice: -1 }] })).toThrow(CalcError);
    expect(() => calcBill({ ...base, items: [] })).toThrow(CalcError);
  });
  it("bill discount", () => {
    const r = calcBill({ ...base, billDiscountType: "PERCENT", billDiscountValue: 500, otherCharges: 1000 });
    expect(r.billDiscount).toBe(1500);
    expect(r.grandTotal).toBe(30000 - 1500 + 1000);
  });
});
