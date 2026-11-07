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

/** Supported print widths in mm (content = printable width inside the paper). Height is always automatic. */
export const PAPER_SIZES = [
  { value: 58, label: "58 mm thermal", content: 48 },
  { value: 72, label: "72 mm (80 mm roll: POS-80C / DCode DC3R1 driver)", content: 68 },
  { value: 76, label: "76 mm thermal", content: 66 },
  { value: 80, label: "80 mm thermal", content: 72 },
  { value: 112, label: "112 mm thermal", content: 104 },
  { value: 148, label: "A5 (148 mm wide)", content: 132 },
  { value: 210, label: "A4 (210 mm wide)", content: 190 },
] as const;

export const PAPER_VALUES: number[] = PAPER_SIZES.map((p) => p.value);

export function paperContentMm(size: number) {
  return PAPER_SIZES.find((p) => p.value === size)?.content ?? 72;
}

/** Units that can only be sold in whole numbers. */
export const WHOLE_UNITS = ["Piece", "Packet", "Pouch", "Box", "Carton"];
