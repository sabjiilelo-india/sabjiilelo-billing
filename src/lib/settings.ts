import { z } from "zod";
import { PAPER_VALUES } from "./constants";
import { prisma } from "./db";

import type { ShopSettings } from "@prisma/client";

export type Settings = ShopSettings;

// Settings are read on nearly every request but change rarely; keep them briefly in memory.
const TTL_MS = 30_000;
let cache: { value: Settings; at: number } | null = null;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  if (!value) value = await prisma.shopSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSettings() {
  cache = null;
}

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
    phone: z
      .string()
      .trim()
      .default("")
      .refine((v) => v === "" || (/^[0-9+()\s-]+$/.test(v) && v.replace(/\D/g, "").length >= 7 && v.replace(/\D/g, "").length <= 15), "Enter a valid phone number"),
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
    paperSize: z.number().refine((v) => PAPER_VALUES.includes(v), "Unsupported paper size").default(80),
    printerName: z.string().trim().max(80).default(""),
    fontSize: z.number("Enter a font size").int().min(8, "Font size must be between 8 and 20").max(20, "Font size must be between 8 and 20").default(12),
    copies: z.number("Enter the number of copies").int().min(1, "Copies must be between 1 and 5").max(5, "Copies must be between 1 and 5").default(1),
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
    footerMessage: s.footerMessage,
    timeZone: s.timeZone,
  };
}
