import type { Metadata } from "next";
import { AuditView } from "@/components/admin/sections/audit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit log" };

export default function Page() {
  return <AuditView />;
}
