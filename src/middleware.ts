import { NextResponse, type NextRequest } from "next/server";
import { verifyToken } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/constants";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // Behind a TLS-terminating proxy (Render) req.url carries the internal scheme/host, so use the forwarded ones.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? req.nextUrl.protocol.replace(":", "");
  const publicUrl = (path: string) => new URL(path, `${proto}://${host}`);

  // CSRF defence in depth on top of SameSite=Lax: mutating requests must come from our own host.
  if (isApi && MUTATING.has(req.method)) {
    const origin = req.headers.get("origin");
    let originHost: string | null = null;
    try {
      originHost = origin ? new URL(origin).host : null;
    } catch {}
    if (origin && originHost !== host) {
      return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    }
  }

  const session = await verifyToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = pathname === "/login" || pathname === "/api/auth/login" || pathname === "/api/auth/logout";

  if (!session && !isPublic) {
    if (isApi) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const url = publicUrl("/login");
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (session && pathname === "/login") return NextResponse.redirect(publicUrl("/dashboard"));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:webp|png|jpg|jpeg|svg|ico)$).*)"],
};
