"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/card";
import { Segmented } from "@/components/ui/form";
import { useI18n } from "@/lib/i18n";
import { useAdminQuery } from "../context";
import { fmtDateTime } from "../format";
import { LastUpdated, Mono, NoData, QueryGate, SectionHeader, TableWrap, td, th } from "../primitives";
import type { AuditRow } from "../types";

const ACTION_TONE: Record<string, BadgeTone> = { role_grant: "warn", role_revoke: "warn", admin_access: "neutral", alert_test: "brand" };

function Details({ value }: { value: Record<string, unknown> | null }) {
  const entries = value ? Object.entries(value) : [];
  if (!entries.length) return <span className="text-fg-3">—</span>;
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
      {entries.map(([k, v]) => (
        <li key={k} className="text-xs">
          <span className="text-fg-3">{k}</span> <span className="text-fg">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </li>
      ))}
    </ul>
  );
}

type Limit = "100" | "250" | "500";

export function AuditView() {
  const { t, locale } = useI18n();
  const [limit, setLimit] = useState<Limit>("100");
  const q = useAdminQuery<AuditRow[]>(`/api/admin/audit?limit=${limit}`);
  const rows = q.data ?? [];

  return (
    <>
      <SectionHeader title={t("admin2.nav.audit")} sub={t("admin2.audit.sub")} right={<LastUpdated at={q.fetchedAt} loading={q.loading} onRefresh={q.reload} />} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented<Limit>
          size="sm"
          ariaLabel="Number of entries"
          value={limit}
          onChange={setLimit}
          options={[
            { value: "100", label: "Latest 100" },
            { value: "250", label: "250" },
            { value: "500", label: "500" },
          ]}
        />
        <span className="text-xs text-fg-3">Newest first. Contains ids and metadata only — no user content.</span>
      </div>
      <QueryGate queries={[q]}>
        {rows.length === 0 ? (
          <NoData title="No audit entries" text="Role changes, administrator access and alert tests will appear here." />
        ) : (
          <TableWrap label="Audit log">
            <thead>
              <tr>
                <th scope="col" className={th}>
                  Time
                </th>
                <th scope="col" className={th}>
                  Action
                </th>
                <th scope="col" className={th}>
                  Actor
                </th>
                <th scope="col" className={th}>
                  Target user
                </th>
                <th scope="col" className={th}>
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.at}-${i}`}>
                  <td className={`${td} whitespace-nowrap text-fg-2`}>
                    <time dateTime={r.at}>{fmtDateTime(r.at, locale)}</time>
                  </td>
                  <td className={td}>
                    <Badge tone={ACTION_TONE[r.action] ?? "outline"}>{r.action}</Badge>
                  </td>
                  <td className={td}>{r.actor ? <Mono>{r.actor}</Mono> : <span className="text-fg-3">—</span>}</td>
                  <td className={td}>{r.target_user_id ? <Mono>{r.target_user_id.slice(0, 8)}</Mono> : <span className="text-fg-3">—</span>}</td>
                  <td className={`${td} max-w-md whitespace-normal`}>
                    <Details value={r.details} />
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </QueryGate>
    </>
  );
}
