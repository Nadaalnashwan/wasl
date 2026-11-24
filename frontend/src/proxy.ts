import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdmin } from "@/lib/admin-session";

/**
 * Server-side gate for the admin console. Runs before any /admin route renders:
 * the HttpOnly admin cookie is re-verified against the backend (role read from the database) on EVERY request,
 * so a revoked administrator loses access immediately. The backend API independently enforces require_admin,
 * so this gate protects the console shell; the data itself is never served to non-admins.
 */
export async function proxy(req: NextRequest) {
  const gate = new URL("/admin-gate", req.url);
  gate.searchParams.set("next", req.nextUrl.pathname);
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  if (!token) return NextResponse.redirect(gate);

  const verdict = await verifyAdmin(token);
  if (verdict !== "admin") {
    if (verdict === "forbidden") gate.searchParams.set("reason", "forbidden");
    const res = NextResponse.redirect(gate);
    if (verdict !== "error") res.cookies.delete(ADMIN_COOKIE);
    return res;
  }
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store, max-age=0");
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
