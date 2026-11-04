import { NextResponse } from "next/server";
import { readJson, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSettings, invalidateSettings, settingsSchema } from "@/lib/settings";

// The logo is ~140 KB of base64, so it is only sent when explicitly requested (?full=1).
export const GET = route(async (req) => {
  const settings = await getSettings();
  const full = new URL(req.url).searchParams.get("full") === "1";
  return NextResponse.json({ settings: full ? settings : { ...settings, logo: "" } });
});

export const PUT = route(
  async (req, _ctx, session) => {
    const data = settingsSchema.parse(await readJson(req));
    const settings = await prisma.shopSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    invalidateSettings();
    await audit("SETTINGS_UPDATED", "ShopSettings", "1", session.uid, { shopName: data.shopName, taxEnabled: data.taxEnabled, paperSize: data.paperSize });
    return NextResponse.json({ settings });
  },
  { adminOnly: true },
);
