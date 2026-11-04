import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Brand defaults for a fresh install; existing settings are never overwritten.
function brandDefaults() {
  const logoPath = path.join(process.cwd(), "public", "logo-full-dark.webp");
  const logo = "data:image/webp;base64," + readFileSync(logoPath).toString("base64");
  return {
    shopName: "Sabjii Le Lo",
    footerMessage: "Har Kisan Se Har Ghar Tak\nThank you! Visit again.",
    logo,
  };
}

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD");
  if (password.length < 8) throw new Error("ADMIN_PASSWORD must be at least 8 characters");
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.admin.upsert({
    where: { username },
    create: { username, passwordHash, role: "ADMIN" },
    update: { passwordHash, isActive: true },
  });
  await prisma.shopSettings.upsert({ where: { id: 1 }, create: { id: 1, ...brandDefaults() }, update: {} });
  console.log(`Admin "${username}" ready.`);
}

main().finally(() => prisma.$disconnect());
