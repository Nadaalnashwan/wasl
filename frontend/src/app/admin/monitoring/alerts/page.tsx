import type { Metadata } from "next";
import { AlertsView } from "@/components/admin/sections/alerts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alerts & incidents" };

export default function Page() {
  return <AlertsView />;
}
