import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, route } from "@/lib/api";
import { voidBill } from "@/lib/bills";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ reason: z.string().trim().min(3, "Enter a cancellation reason").max(300) });

export const POST = route<Ctx>(
  async (req, ctx, session) => {
    const { id } = await ctx.params;
    const { reason } = schema.parse(await readJson(req));
    const bill = await voidBill(id, reason, session.uid);
    return NextResponse.json({ bill });
  },
  { adminOnly: true },
);
