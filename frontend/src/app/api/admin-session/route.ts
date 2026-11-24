import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, ADMIN_COOKIE_MAX_AGE, verifyAdmin } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

/** Exchange a bearer token for an HttpOnly admin cookie — only after the BACKEND confirms the admin role. */
export async function POST(req: NextRequest) {
  // same-origin only (blocks cross-site form posts that try to plant a cookie)
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin) return NextResponse.json({ ok: false }, { status: 403 });
  let token = "";
  try {
    token = String((await req.json())?.token ?? "");
  } catch {
    /* empty body */
  }
  if (!token || token.length > 8192) return NextResponse.json({ ok: false }, { status: 400 });
  const verdict = await verifyAdmin(token);
  const res = NextResponse.json({ ok: verdict === "admin" }, { status: verdict === "admin" ? 200 : verdict === "error" ? 502 : 403 });
  res.headers.set("Cache-Control", "no-store");
  if (verdict === "admin") {
    res.cookies.set(ADMIN_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: ADMIN_COOKIE_MAX_AGE,
    });
  } else if (verdict !== "error") {
    res.cookies.delete(ADMIN_COOKIE);
  }
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ADMIN_COOKIE);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
