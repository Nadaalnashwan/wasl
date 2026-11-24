"use client";

import { Loader2, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Logo } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { getApiToken } from "@/lib/api";
import { useAuth } from "@/lib/providers";

/** Only same-site admin paths may be resumed after the gate. */
function safeAdminPath(next: string | null) {
  return next && /^\/admin(\/[\w\-/]*)?$/.test(next) ? next : "/admin/monitoring";
}

function Gate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeAdminPath(params.get("next"));
  const [state, setState] = useState<"checking" | "denied" | "error">("checking");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (user.role !== "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from auth state after it settles
      setState("denied");
      return;
    }
    let cancelled = false;
    (async () => {
      const token = await getApiToken();
      const res = await fetch("/api/admin-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        credentials: "same-origin",
      }).catch(() => null);
      if (cancelled) return;
      if (res?.ok) router.replace(next);
      else setState(res?.status === 403 ? "denied" : "error");
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, user, next, router]);

  if (state === "checking") {
    return (
      <div className="flex items-center gap-2 text-sm text-fg-3" role="status">
        <Loader2 className="size-4 animate-spin" /> Verifying administrator access…
      </div>
    );
  }
  return (
    <div className="flex max-w-sm flex-col items-center gap-3 text-center">
      <span className="grid size-10 place-items-center rounded-lg bg-surface-2 text-fg-3">
        <ShieldAlert className="size-5" />
      </span>
      <h1 className="text-heading font-semibold text-fg">{state === "denied" ? "Administrator access required" : "Could not verify access"}</h1>
      <p className="text-sm text-fg-2">
        {state === "denied"
          ? "This area is limited to Wasl administrators. Your account does not have that role."
          : "The server could not be reached to confirm your role. Please try again."}
      </p>
      <Button asChild variant="secondary">
        <Link href="/dashboard">Back to your workspace</Link>
      </Button>
    </div>
  );
}

export default function AdminGatePage() {
  return (
    <main id="main" className="grid min-h-screen place-items-center px-4">
      <div className="flex flex-col items-center gap-8">
        <Logo href="/dashboard" />
        <Suspense fallback={null}>
          <Gate />
        </Suspense>
      </div>
    </main>
  );
}
