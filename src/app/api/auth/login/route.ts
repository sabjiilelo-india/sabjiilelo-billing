import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { errorResponse, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import { setSessionCookie, signSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "@/lib/rateLimit";

const schema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  remember: z.boolean().optional(),
});

// Used to keep response time similar when the username does not exist.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function POST(req: Request) {
  try {
    const body = schema.parse(await readJson(req));
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
    const key = `${ip}|${body.username.toLowerCase()}`;
    if (await isLoginBlocked(key)) {
      return NextResponse.json({ error: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
    }
    const admin = await prisma.admin.findUnique({ where: { username: body.username } });
    const ok = await bcrypt.compare(body.password, admin?.passwordHash ?? DUMMY_HASH);
    if (!admin || !admin.isActive || !ok) {
      await recordLoginFailure(key);
      await audit("LOGIN_FAILED", "Admin", admin?.id ?? null, null, { username: body.username });
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    await clearLoginFailures(key);
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await audit("LOGIN", "Admin", admin.id, admin.id);
    const { token, ttl } = await signSession({ uid: admin.id, username: admin.username, role: admin.role }, !!body.remember);
    const res = NextResponse.json({ user: { username: admin.username, role: admin.role } });
    setSessionCookie(res, token, ttl);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
