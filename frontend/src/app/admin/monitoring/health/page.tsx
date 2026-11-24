import type { Metadata } from "next";
import { HealthView } from "@/components/admin/sections/health";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Application health" };

export default function Page() {
  return <HealthView />;
}
