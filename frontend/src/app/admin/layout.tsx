import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/shell";

/* Separate admin application. The server-side gate lives in src/proxy.ts; every data call is made client-side with
 * the user's bearer token and authorised again by the backend (require_admin). Nothing here is statically generated. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Admin console", template: "%s · Wasl admin" },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
