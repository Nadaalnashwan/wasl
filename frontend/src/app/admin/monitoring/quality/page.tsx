import type { Metadata } from "next";
import { QualityView } from "@/components/admin/sections/quality";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI quality" };

export default function Page() {
  return <QualityView />;
}
