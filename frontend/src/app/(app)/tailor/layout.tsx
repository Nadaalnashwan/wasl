import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tailor a CV" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
