import type { Metadata } from "next";
import { AiPerformanceView } from "@/components/admin/sections/ai-performance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI performance" };

export default function Page() {
  return <AiPerformanceView />;
}
