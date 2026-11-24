import type { Metadata } from "next";
import { OverviewView } from "@/components/admin/sections/overview";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <OverviewView />;
}
