import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

type Db = Pick<typeof prisma, "auditLog">;

export async function audit(
  action: string,
  entity: string,
  entityId: string | null,
  userId: string | null,
  details?: Prisma.InputJsonValue,
  db: Db = prisma,
) {
  await db.auditLog.create({ data: { action, entity, entityId, userId, details } });
}
