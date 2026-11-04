import { z } from "zod";
import { prisma } from "./db";

export async function getSettings() {
  return prisma.shopSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const settingsSchema = z
  .object({
    shopName: z.string().trim().min(1, "Shop name is required").max(80),
    address: z.string().trim().max(200).default(""),
    phone: z.string().trim().max(20).default(""),
    email: z.union([z.literal(""), z.string().trim().email("Invalid email")]).default(""),
    gstin: z.string().trim().toUpperCase().max(15).default(""),
    logo: z
      .string()
      .max(280_000, "Logo is too large (max about 200 KB)")
      .refine((v) => v === "" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v), "Logo must be PNG, JPEG or WebP")
      .default(""),
    footerMessage: z.string().trim().max(200).default(""),
    invoicePrefix: z.string().trim().max(10).regex(/^[A-Za-z0-9-]*$/, "Prefix may use letters, digits and -").default("INV-"),
    timeZone: z.string().refine(validTimeZone, "Unknown time zone").default("Asia/Kolkata"),
    defaultPayment: z.enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "OTHER"]).default("CASH"),
    taxEnabled: z.boolean().default(false),
    taxMode: z.enum(["INTRA", "INTER"]).default("INTRA"),
    roundOff: z.boolean().default(true),
    paperSize: z.union([z.literal(58), z.literal(80)]).default(80),
    printerName: z.string().trim().max(80).default(""),
    fontSize: z.number().int().min(8).max(20).default(12),
    copies: z.number().int().min(1).max(5).default(1),
    autoPreview: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.gstin && !GSTIN.test(v.gstin)) ctx.addIssue({ code: "custom", path: ["gstin"], message: "Invalid GSTIN" });
    if (v.taxEnabled && !v.gstin) ctx.addIssue({ code: "custom", path: ["gstin"], message: "GSTIN is required when tax is enabled" });
  });

/** Shop details frozen onto each bill so later settings changes never alter old receipts. */
export function shopSnapshot(s: Settings) {
  return {
    shopName: s.shopName,
    address: s.address,
    phone: s.phone,
    email: s.email,
    gstin: s.gstin,
    logo: s.logo,
    footerMessage: s.footerMessage,
    timeZone: s.timeZone,
  };
}
