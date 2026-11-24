import type { Metadata } from "next";
import { CostView } from "@/components/admin/sections/cost";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cost & usage" };

export default function Page() {
  return <CostView />;
}
