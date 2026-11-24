/** Server-only helpers shared by the admin proxy and the admin-session route handler. */
export const ADMIN_COOKIE = "wasl_admin";
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 8; // 8h; the backend re-checks the role on every request anyway

export const BACKEND_URL = (process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

/** Ask the backend whether this bearer token belongs to a CURRENT administrator. */
export async function verifyAdmin(token: string): Promise<"admin" | "forbidden" | "unauthenticated" | "error"> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/admin/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return "admin";
    if (res.status === 401) return "unauthenticated";
    if (res.status === 403) return "forbidden";
    return "error";
  } catch {
    return "error";
  }
}
