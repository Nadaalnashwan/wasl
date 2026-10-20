"use client";

import { FileUp, Plus, RefreshCw, ScanSearch, Star } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { AchievementCard, AddAchievementDialog } from "@/components/achievements";
import { GithubIcon } from "@/components/brand-icons";
import { AiWorking, EmptyState, ErrorNote, Loading } from "@/components/feedback";
import { ClawArt } from "@/components/sketch/illustrations";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { api, ApiError, upload } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { Achievement, IntegrationStatus } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";

type Repo = {
  full_name: string;
  description: string;
  language: string | null;
  stars: number;
  fork: boolean;
  private: boolean;
  pushed_at: string;
  scan_state: "new" | "updated" | "unchanged";
  last_scanned_at: string | null;
};

type ScanResult = { repo: string; status: string; message?: string; candidates?: Achievement[]; your_commits?: number; no_achievement_reason?: string };

function GitHubPanel({ onFound }: { onFound: () => void }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const integ = useApi<Record<string, IntegrationStatus>>("/api/integrations");
  const gh = integ.data?.github;
  const repos = useApi<{ account: string; repos: Repo[] }>(gh?.connected ? "/api/discovery/github/repos" : null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ScanResult[] | null>(null);

  async function scan(force = false) {
    setBusy(true);
    try {
      const r = await api<{ results: ScanResult[]; skipped_over_limit: string[] }>("/api/discovery/github/scan", { method: "POST", json: { repos: [...sel], force } });
      setResults(r.results);
      if (r.skipped_over_limit.length) toast("info", `Skipped ${r.skipped_over_limit.length} repo(s) over the per-scan limit.`);
      setSel(new Set());
      repos.reload();
      onFound();
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (integ.loading) return <Loading />;
  if (!gh?.connected)
    return (
      <div className="sketch-dashed flex flex-col items-center gap-3 p-6 text-center text-sm">
        <GithubIcon className="size-8" />
        <p>{gh?.configured_on_server === false ? t("disc.github.unconfigured") : t("disc.github.off")}</p>
        {gh?.configured_on_server !== false && (
          <Button asChild size="sm">
            <Link href="/settings">{t("nav.settings")}</Link>
          </Button>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm">
        <GithubIcon className="size-4" /> <b>{repos.data?.account}</b>
        <Button size="sm" variant="ghost" className="ms-auto" onClick={repos.reload} aria-label="Refresh">
          <RefreshCw />
        </Button>
      </div>
      <ErrorNote error={repos.error} onRetry={repos.reload} />
      {repos.loading && !repos.data && <Loading />}
      <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pe-1">
        {repos.data?.repos.map((r) => (
          <li key={r.full_name}>
            <label className={cn("sketch-soft flex cursor-pointer items-start gap-3 p-3", sel.has(r.full_name) && "bg-sky")}>
              <input
                type="checkbox"
                className="mt-1 size-4 accent-[var(--brand)]"
                checked={sel.has(r.full_name)}
                onChange={(e) => {
                  const n = new Set(sel);
                  if (e.target.checked) n.add(r.full_name);
                  else n.delete(r.full_name);
                  setSel(n);
                }}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <b className="truncate text-sm">{r.full_name}</b>
                  <Badge tone={r.scan_state === "unchanged" ? "neutral" : r.scan_state === "new" ? "sky" : "warn"}>{t(`disc.state.${r.scan_state}`)}</Badge>
                  {r.fork && <Badge>fork</Badge>}
                </span>
                {r.description && <span className="mt-0.5 line-clamp-2 block text-xs text-ink-soft">{r.description}</span>}
                <span className="mt-1 flex gap-3 text-xs text-ink-faint">
                  {r.language && <span>{r.language}</span>}
                  <span className="flex items-center gap-0.5">
                    <Star className="size-3" /> {r.stars}
                  </span>
                  <span>pushed {timeAgo(r.pushed_at)}</span>
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {busy && <AiWorking steps={locale === "ar" ? ["قراءة README", "استخراج", "تحقق", "كشف التكرار"] : ["read README & manifests", "extract", "verify evidence", "dedupe"]} />}
      <div className="flex gap-2">
        <Button onClick={() => scan(false)} loading={busy} disabled={!sel.size}>
          <ScanSearch /> {t("disc.scan")} ({sel.size})
        </Button>
        <Button variant="outline" onClick={() => scan(true)} disabled={!sel.size || busy} title="Re-scan even if unchanged">
          <RefreshCw />
        </Button>
      </div>
      {results && (
        <ul className="flex flex-col gap-1 text-sm">
          {results.map((r) => (
            <li key={r.repo} className="flex flex-wrap gap-2">
              <b>{r.repo}</b>
              <Badge tone={r.status === "scanned" ? "ok" : r.status === "error" ? "bad" : "neutral"}>{r.status}</Badge>
              {r.status === "scanned" && <span className="text-ink-soft">{r.candidates?.length ?? 0} found · your commits: {r.your_commits}</span>}
              {r.message && <span className="text-ink-soft">{r.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function DiscoveryPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const pending = useApi<Achievement[]>("/api/achievements?status=pending");
  const confirmed = useApi<Achievement[]>("/api/achievements?status=confirmed");
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [drag, setDrag] = useState(false);

  const reload = () => {
    pending.reload();
    confirmed.reload();
  };

  async function onFile(f?: File) {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const r = await upload<{ candidates: Achievement[]; injection_flags: string[]; no_achievement_reason: string }>("/api/discovery/upload", f);
      toast(r.candidates.length ? "ok" : "info", r.candidates.length ? `${r.candidates.length} ${locale === "ar" ? "إنجاز مكتشف" : "achievement(s) found"}` : r.no_achievement_reason || "No achievement found");
      if (r.injection_flags.length) toast("info", locale === "ar" ? "أزلنا نصاً مشبوهاً من الملف." : "Instruction-like text in the file was ignored.");
      reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <PageHeader
        title={t("disc.title")}
        sub={t("disc.sub")}
        art={<ClawArt className="h-28 w-auto" />}
        actions={
          <AddAchievementDialog
            onDone={reload}
            trigger={
              <Button>
                <Plus /> {t("dash.add")}
              </Button>
            }
          />
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle icon={<FileUp />}>{t("disc.upload")}</CardTitle>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
            className={cn("sketch-dashed flex flex-col items-center gap-3 p-8 text-center transition-colors", drag && "bg-sky")}
          >
            <FileUp className="size-10" />
            <p className="text-sm text-ink-soft">PDF · DOCX · TXT · MD — max 5 MB</p>
            <input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} loading={busy}>
              {locale === "ar" ? "اختر ملفاً" : "Choose a file"}
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {busy && <AiWorking steps={locale === "ar" ? ["قراءة الملف", "تنقية", "استخراج", "تحقق"] : ["read file", "sanitize", "extract", "verify evidence"]} />}
            <ErrorNote error={error} />
          </div>
        </Card>
        <Card>
          <CardTitle icon={<GithubIcon />}>{t("disc.github")}</CardTitle>
          <GitHubPanel onFound={reload} />
        </Card>
      </div>

      <h2 className="mt-12 mb-4 flex items-center gap-2 font-hand text-3xl">
        {t("disc.review")} {!!pending.data?.length && <Badge tone="warn">{pending.data.length}</Badge>}
      </h2>
      {pending.loading && !pending.data && <Loading />}
      {pending.data?.length === 0 && <EmptyState title={t("common.none")} />}
      <div className="grid gap-4 md:grid-cols-2">
        {pending.data?.map((a) => (
          <AchievementCard key={a.id} a={a} onChanged={reload} />
        ))}
      </div>

      <h2 className="mt-12 mb-4 font-hand text-3xl">{t("dash.achievements")}</h2>
      {confirmed.data?.length === 0 && <p className="text-sm text-ink-soft">{t("common.none")}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {confirmed.data?.map((a) => (
          <div key={a.id} className="flex flex-col gap-2">
            <AchievementCard a={a} onChanged={reload} />
            <Button asChild size="sm" variant="ghost" className="self-start">
              <Link href={`/studio?achievement=${a.id}`}>→ {t("nav.studio")}</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
