export const UNITS = [
  "Piece", "Packet", "Pouch", "Kg", "Gram", "Litre", "Millilitre", "Box", "Carton", "Dozen", "Custom",
] as const;

export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

/** Tax slabs in basis points. */
export const TAX_RATES = [0, 500, 1200, 1800, 2800] as const;

export const SESSION_COOKIE = "tb_session";
