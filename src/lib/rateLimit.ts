import { prisma } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

/** Failed-login limiter backed by the database so it works across instances. */
export async function isLoginBlocked(key: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_MS);
  const n = await prisma.loginAttempt.count({ where: { key, createdAt: { gte: since } } });
  return n >= MAX_FAILURES;
}

export async function recordLoginFailure(key: string) {
  await prisma.loginAttempt.create({ data: { key } });
  // opportunistic cleanup of old rows
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - WINDOW_MS * 4) } } });
}

export async function clearLoginFailures(key: string) {
  await prisma.loginAttempt.deleteMany({ where: { key } });
}
