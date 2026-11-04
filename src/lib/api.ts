import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CalcError } from "./calc";
import { DateRangeError } from "./dates";
import { getSession, type Session } from "./auth";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Handler<C> = (req: Request, ctx: C, session: Session) => Promise<Response>;

/** Wraps a route handler: requires a session and maps errors to JSON responses. */
export function route<C = unknown>(handler: Handler<C>, opts: { adminOnly?: boolean } = {}) {
  return async (req: Request, ctx: C) => {
    try {
      const session = await getSession();
      if (!session) throw new HttpError(401, "Not authenticated");
      if (opts.adminOnly && session.role !== "ADMIN") throw new HttpError(403, "Not allowed");
      return await handler(req, ctx, session);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof CalcError || e instanceof DateRangeError) return NextResponse.json({ error: e.message }, { status: 400 });
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return NextResponse.json({ error: first?.message ?? "Invalid input", field: first?.path.join(".") ?? null }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}
