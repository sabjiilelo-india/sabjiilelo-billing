import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "./constants";

export interface Session {
  uid: string;
  username: string;
  role: "ADMIN" | "STAFF";
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session, remember: boolean) {
  const ttl = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 12;
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret());
  return { token, ttl };
}

export async function verifyToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { uid: String(payload.uid), username: String(payload.username), role: payload.role as Session["role"] };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

export function setSessionCookie(res: NextResponse, token: string, ttl: number) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}
