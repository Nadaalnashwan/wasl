import { AchievementsView } from "@/components/achievements/achievements-view";

export const metadata = { title: "Achievements" };

const STATUSES = ["pending", "confirmed", "rejected"] as const;

/** /achievements?status=pending|confirmed|rejected&open=<achievement id> */
export default async function AchievementsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const status = one(sp.status);
  const open = one(sp.open);
  return (
    <AchievementsView
      initialStatus={STATUSES.find((s) => s === status)}
      initialOpen={open && /^[\w-]{1,64}$/.test(open) ? open : undefined}
    />
  );
}
