import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // CSRF defence in depth on top of SameSite=Lax: mutating requests must come from our own origin.
  if (isApi && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin) {
      return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    }
  }

  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout";

  if (!session && !isPublic) {
    if (isApi) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session && pathname === "/login") return NextResponse.redirect(new URL("/dashboard", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|jpg|jpeg|svg|ico)$).*)"],
};
