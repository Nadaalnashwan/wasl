import type { Metadata } from "next";
import { EvaluationView } from "@/components/admin/sections/evaluation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evaluation" };

export default function Page() {
  return <EvaluationView />;
}
