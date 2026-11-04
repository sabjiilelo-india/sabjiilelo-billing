export interface ShopSnapshot {
  shopName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  logo: string;
  footerMessage: string;
  timeZone: string;
}

export interface BillItemDto {
  id: string;
  itemName: string;
  itemCode: string;
  quantity: string | number;
  unit: string;
  unitPrice: number;
  discountType: "FIXED" | "PERCENT";
  discountValue: number;
  discountAmount: number;
  taxRate: number;
  grossAmount: number;
  taxableAmount: number;
  taxAmount: number;
  lineTotal: number;
}

export interface BillDto {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerMobile: string;
  customerAddress: string;
  shopSnapshot: ShopSnapshot;
  subtotal: number;
  itemDiscount: number;
  billDiscount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxAmount: number;
  otherCharges: number;
  roundOff: number;
  grandTotal: number;
  paymentMethod: string;
  amountPaid: number;
  balanceDue: number;
  changeGiven: number;
  paymentStatus: "PAID" | "PARTIAL" | "UNPAID";
  billStatus: "COMPLETED" | "VOIDED";
  taxEnabled: boolean;
  voidReason: string | null;
  voidedAt: string | null;
  createdAt: string;
  items: BillItemDto[];
  createdBy?: { username: string };
  printLogs?: { id: string; userId: string; paperSize: number; createdAt: string }[];
}

export interface SettingsDto {
  shopName: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  logo: string;
  footerMessage: string;
  invoicePrefix: string;
  timeZone: string;
  defaultPayment: string;
  taxEnabled: boolean;
  taxMode: "INTRA" | "INTER";
  roundOff: boolean;
  paperSize: 58 | 80;
  printerName: string;
  fontSize: number;
  copies: number;
  autoPreview: boolean;
}
