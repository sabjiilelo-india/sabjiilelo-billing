import { NextResponse } from "next/server";
import { readJson, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSettings, settingsSchema } from "@/lib/settings";

export const GET = route(async () => {
  return NextResponse.json({ settings: await getSettings() });
});

export const PUT = route(
  async (req, _ctx, session) => {
    const data = settingsSchema.parse(await readJson(req));
    const settings = await prisma.shopSettings.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    await audit("SETTINGS_UPDATED", "ShopSettings", "1", session.uid, { shopName: data.shopName, taxEnabled: data.taxEnabled, paperSize: data.paperSize });
    return NextResponse.json({ settings });
  },
  { adminOnly: true },
);
