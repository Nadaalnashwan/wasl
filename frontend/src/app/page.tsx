"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Home } from "@/components/landing/home";
import { FullPageSpinner } from "@/components/shell/app-shell";
import { useAuth } from "@/lib/providers";

export default function Landing() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Signed-in visitors go straight to their workspace.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (!loading && user) return <FullPageSpinner />;
  return <Home />;
}
