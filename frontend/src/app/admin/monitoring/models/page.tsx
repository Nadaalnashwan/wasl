import type { Metadata } from "next";
import { ModelsView } from "@/components/admin/sections/models";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Providers & models" };

export default function Page() {
  return <ModelsView />;
}
