import { NextResponse } from "next/server";
import { route } from "@/lib/api";

export const GET = route(async (_req, _ctx, session) => {
  return NextResponse.json({ user: { username: session.username, role: session.role } });
});
