"use client";

import { AlertCircle, ArrowLeft, FileQuestion, FileUp, Info, PenLine, RefreshCw, Settings, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { GithubIcon } from "@/components/brand-icons";
import { AiWorking, ErrorNote, Loading, Notice } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Status } from "@/components/ui/card";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, DialogTrigger, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, ApiError, upload } from "@/lib/api";
import { splitList, useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import { fmtDate } from "@/lib/utils";
import { CandidateItem } from "./review";
import { CATEGORIES, cvUpdateTone, fmt, type CVUpdate, type DiscoveryResult, type GithubRepo, type IntegrationStatus, type ScanResult } from "./shared";

const MAX_REPOS = 20; // request schema limit (ScanIn.repos max_length); the server may scan fewer and reports the rest

export type AddMethod = "manual" | "text" | "document" | "github";

function useSteps(key: "achievements2.text.steps" | "achievements2.doc.steps" | "achievements2.gh.steps") {
  const { t } = useI18n();
  return t(key).split("|");
}

function InjectionNotice({ flags }: { flags: string[] }) {
  const { t } = useI18n();
  if (!flags.length) return null;
  return (
    <Notice tone="info" icon={<Info className="text-fg-3" />}>
      {t("achievements2.injection")}
    </Notice>
  );
}

/** Candidates returned by /extract or /discovery/upload. They are saved as pending drafts. */
function CandidateResults({ result, onReset, onDecided }: { result: DiscoveryResult; onReset: () => void; onDecided?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">{fmt(t("achievements2.candidates.title"), { n: result.candidates.length })}</h3>
          {result.candidates.length > 0 && <p className="mt-0.5 text-sm text-fg-3">{t("achievements2.candidates.d")}</p>}
          {result.file && <p className="mt-0.5 text-xs text-fg-3">{fmt(t("achievements2.candidates.file"), { f: result.file })}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onReset}>
          <ArrowLeft className="rtl:rotate-180" /> {t("achievements2.candidates.again")}
        </Button>
      </div>
      <InjectionNotice flags={result.injection_flags} />
      {result.candidates.length === 0 ? (
        <p className="flex items-start gap-2 border-s-2 border-border py-1 ps-4 text-sm text-fg-2">
          <FileQuestion className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
          {result.no_achievement_reason || t("achievements2.candidates.none")}
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {result.candidates.map((c) => (
            <CandidateItem key={c.id} a={c} onDecided={onDecided} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ manual */
function ManualForm({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [dup, setDup] = useState<{ title: string } | null>(null);
  const [form, setForm] = useState({ title: "", description: "", category: "project", technologies: "", skills: "", impact: "", occurred_on: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save(force = false) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ cv_update: CVUpdate | null }>(`/api/achievements${force ? "?force=true" : ""}`, {
        method: "POST",
        json: { ...form, technologies: splitList(form.technologies), skills: splitList(form.skills) },
      });
      toast("ok", t("achievements2.add.saved"));
      if (res.cv_update) {
        const tone = cvUpdateTone(res.cv_update.status);
        toast(tone === "ok" ? "ok" : tone === "bad" ? "error" : "info", t(`achievements2.cv.${res.cv_update.status}`));
      }
      onSaved();
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, String(e));
      if (err.status === 409 && typeof err.detail === "object" && err.detail && "duplicate_of" in err.detail) {
        setDup((err.detail as { duplicate_of: { title: string } }).duplicate_of);
      } else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="text-sm text-fg-3 sm:col-span-2">{t("achievements2.add.manual.d")}</p>
      <Field label={t("ach.title")} className="sm:col-span-2">
        <Input required minLength={3} maxLength={300} value={form.title} onChange={set("title")} dir="auto" />
      </Field>
      <Field label={t("ach.description")} className="sm:col-span-2">
        <Textarea value={form.description} maxLength={4000} onChange={set("description")} dir="auto" />
      </Field>
      <Field label={t("ach.category")}>
        <Select value={form.category} onChange={set("category")}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`ach.cat.${c}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("ach.date")}>
        <Input placeholder={t("achievements2.add.date.ph")} value={form.occurred_on} maxLength={20} onChange={set("occurred_on")} />
      </Field>
      <Field label={t("ach.technologies")}>
        <Input value={form.technologies} onChange={set("technologies")} />
      </Field>
      <Field label={t("ach.skills")}>
        <Input value={form.skills} onChange={set("skills")} />
      </Field>
      <Field label={t("ach.impact")} className="sm:col-span-2">
        <Input value={form.impact} maxLength={1500} onChange={set("impact")} dir="auto" />
      </Field>
      {dup && (
        <div className="sm:col-span-2" role="alert">
          <Notice tone="warn" icon={<AlertCircle className="text-warn" />} title={fmt(t("achievements2.duplicate"), { t: dup.title })}>
            <Button size="xs" variant="secondary" className="mt-2" loading={busy} onClick={() => save(true)}>
              {t("achievements2.duplicate.save_anyway")}
            </Button>
          </Notice>
        </div>
      )}
      <ErrorNote error={error} className="sm:col-span-2" />
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={busy} disabled={form.title.trim().length < 3}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ free text */
function TextExtract({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const steps = useSteps("achievements2.text.steps");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  async function extract() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<DiscoveryResult>("/api/achievements/extract", { method: "POST", json: { text } });
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (result) return <CandidateResults result={result} onReset={() => setResult(null)} onDecided={onDone} />;

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("achievements2.text.label")} hint={t("ach.extract.hint")}>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-36" maxLength={12000} dir="auto" />
      </Field>
      {busy && <AiWorking steps={steps} />}
      <ErrorNote error={error} />
      <div className="flex justify-end">
        <Button onClick={extract} loading={busy} disabled={text.trim().length < 20}>
          <Sparkles /> {t("achievements2.text.run")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ document */
function DocumentUpload({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const steps = useSteps("achievements2.doc.steps");
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await upload<DiscoveryResult>("/api/discovery/upload", file);
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      setBusy(false);
    }
  }

  if (result)
    return (
      <CandidateResults
        result={result}
        onReset={() => {
          setResult(null);
          setFile(null);
        }}
        onDecided={onDone}
      />
    );

  return (
    <div className="flex flex-col gap-4">
      <Field label={t("achievements2.doc.label")} hint={t("achievements2.doc.hint")}>
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full cursor-pointer rounded-lg border border-dashed border-border-strong bg-surface-2 p-3 text-sm text-fg-2 file:me-3 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-fg hover:border-primary/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        />
      </Field>
      {file && <p className="text-xs text-fg-3">{fmt(t("achievements2.doc.selected"), { f: file.name })}</p>}
      {busy && <AiWorking steps={steps} />}
      <ErrorNote error={error} />
      <div className="flex justify-end">
        <Button onClick={run} loading={busy} disabled={!file}>
          <FileUp /> {t("achievements2.doc.run")}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ GitHub */
function GithubBlocked({ kind }: { kind: "not_configured" | "not_connected" }) {
  const { t } = useI18n();
  return (
    <Notice tone={kind === "not_configured" ? "warn" : "info"} icon={<GithubIcon className="text-fg-3" />} title={t(`achievements2.gh.${kind}`)}>
      <p>{t(`achievements2.gh.${kind}.d`)}</p>
      {kind === "not_connected" && (
        <Button asChild size="xs" variant="secondary" className="mt-2">
          <Link href="/settings">
            <Settings /> {t("achievements2.gh.settings")}
          </Link>
        </Button>
      )}
    </Notice>
  );
}

function blockedFrom(e: ApiError | null): "not_configured" | "not_connected" | null {
  if (!e) return null;
  if (e.status === 503) return "not_configured";
  if (e.status === 412) return "not_connected";
  return null;
}

const SCAN_TONE = { new: "brand", updated: "warn", unchanged: "neutral" } as const;

function GithubScan({ onDone }: { onDone: () => void }) {
  const { t, locale } = useI18n();
  const steps = useSteps("achievements2.gh.steps");
  const integ = useApi<{ github?: IntegrationStatus }>("/api/integrations");
  const gh = integ.data?.github;
  const preBlocked = gh ? (!gh.configured_on_server ? "not_configured" : !gh.connected ? "not_connected" : null) : null;
  const repos = useApi<{ account: string | null; repos: GithubRepo[] }>(gh && !preBlocked ? "/api/discovery/github/repos" : null);
  const [selected, setSelected] = useState<string[]>([]);
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scanError, setScanError] = useState<ApiError | null>(null);
  const [scan, setScan] = useState<{ results: ScanResult[]; skipped_over_limit: string[] } | null>(null);

  const blocked = preBlocked ?? blockedFrom(repos.error) ?? blockedFrom(scanError);

  async function run() {
    setBusy(true);
    setScanError(null);
    try {
      const res = await api<{ results: ScanResult[]; skipped_over_limit: string[] }>("/api/discovery/github/scan", {
        method: "POST",
        json: { repos: selected, force },
      });
      setScan(res);
      onDone();
    } catch (e) {
      setScanError(e instanceof ApiError ? e : new ApiError(0, String(e)));
    } finally {
      setBusy(false);
    }
  }

  function toggle(name: string, on: boolean) {
    setSelected((s) => (on ? (s.includes(name) || s.length >= MAX_REPOS ? s : [...s, name]) : s.filter((x) => x !== name)));
  }

  if (integ.loading && !integ.data) return <Loading label={t("achievements2.gh.checking")} />;
  if (integ.error) return <ErrorNote error={integ.error} onRetry={integ.reload} />;
  if (blocked) return <GithubBlocked kind={blocked} />;

  if (scan) {
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="flex-1 text-sm font-semibold text-fg">{t("achievements2.gh.results")}</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setScan(null);
              setSelected([]);
              repos.reload();
            }}
          >
            <ArrowLeft className="rtl:rotate-180" /> {t("achievements2.gh.back")}
          </Button>
        </div>
        {scan.skipped_over_limit.length > 0 && (
          <Notice tone="warn">{fmt(t("achievements2.gh.skipped"), { r: scan.skipped_over_limit.join(", ") })}</Notice>
        )}
        <ul className="flex flex-col gap-4">
          {scan.results.map((r) => (
            <li key={r.repo} className="rounded-xl border border-border">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-3">
                <GithubIcon className="size-4 shrink-0 text-fg-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{r.repo}</span>
                {r.status === "scanned" && (
                  <>
                    <Status tone="ok">{fmt(t("achievements2.gh.res.scanned"), { n: r.candidates.length })}</Status>
                    <span className="text-xs text-fg-3">{fmt(t("achievements2.gh.commits"), { n: r.your_commits })}</span>
                  </>
                )}
                {r.status === "unchanged" && <Status tone="neutral">{t("achievements2.gh.res.unchanged")}</Status>}
                {r.status === "error" && <Status tone="bad">{t("achievements2.gh.res.error")}</Status>}
              </div>
              {r.status === "error" && <p className="px-4 py-3 text-sm text-bad">{r.message}</p>}
              {r.status === "scanned" && (
                <div className="flex flex-col gap-3">
                  {r.injection_flags.length > 0 && (
                    <div className="px-4 pt-3">
                      <InjectionNotice flags={r.injection_flags} />
                    </div>
                  )}
                  {r.candidates.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-fg-2">{r.no_achievement_reason || t("achievements2.candidates.none")}</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {r.candidates.map((c) => (
                        <CandidateItem key={c.id} a={c} onDecided={onDone} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (repos.loading && !repos.data) return <Loading />;
  if (repos.error) return <ErrorNote error={repos.error} onRetry={repos.reload} />;
  const list = repos.data?.repos ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-fg">{t("achievements2.gh.repos")}</h3>
          {repos.data?.account && <p className="text-xs text-fg-3">{fmt(t("achievements2.gh.account"), { a: repos.data.account })}</p>}
        </div>
        {list.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-fg-3" aria-live="polite">
              {fmt(t("achievements2.gh.selected"), { n: selected.length })}
            </span>
            <Button variant="ghost" size="xs" onClick={() => setSelected(list.slice(0, MAX_REPOS).map((r) => r.full_name))}>
              {t("achievements2.gh.select_all")}
            </Button>
            <Button variant="ghost" size="xs" onClick={() => setSelected([])} disabled={!selected.length}>
              {t("achievements2.gh.select_none")}
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={repos.reload} aria-label={t("common.retry")}>
              <RefreshCw />
            </Button>
          </div>
        )}
      </div>

      {list.length === 0 ? (
        <p className="border-s-2 border-border py-1 ps-4 text-sm text-fg-2">{t("achievements2.gh.empty")}</p>
      ) : (
        <ul className="max-h-[46vh] divide-y divide-border overflow-y-auto rounded-xl border border-border" aria-label={t("achievements2.gh.repos")}>
          {list.map((r) => {
            const on = selected.includes(r.full_name);
            return (
              <li key={r.full_name} className="px-4 py-3">
                <Checkbox
                  checked={on}
                  disabled={!on && selected.length >= MAX_REPOS}
                  onChange={(e) => toggle(r.full_name, e.target.checked)}
                  label={
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="break-all">{r.full_name}</span>
                      <Badge tone={SCAN_TONE[r.scan_state]}>{t(`achievements2.gh.state.${r.scan_state}`)}</Badge>
                      {r.private && <Badge tone="outline">{t("achievements2.gh.private")}</Badge>}
                      {r.fork && <Badge tone="outline">{t("achievements2.gh.fork")}</Badge>}
                    </span>
                  }
                  description={
                    <span className="flex flex-col gap-0.5">
                      {r.description && <span className="line-clamp-2">{r.description}</span>}
                      <span className="flex flex-wrap items-center gap-x-3">
                        {r.language && <span>{r.language}</span>}
                        {r.stars > 0 && (
                          <span className="num inline-flex items-center gap-0.5">
                            <Star className="size-3" aria-hidden /> {r.stars}
                          </span>
                        )}
                        {r.last_scanned_at && <span>{fmt(t("achievements2.gh.last_scanned"), { d: fmtDate(r.last_scanned_at, locale) })}</span>}
                      </span>
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      {list.length > 0 && (
        <>
          <p className="text-xs text-fg-3">{fmt(t("achievements2.gh.max"), { n: MAX_REPOS })}</p>
          <Checkbox checked={force} onChange={(e) => setForce(e.target.checked)} label={t("achievements2.gh.force")} />
          {busy && <AiWorking steps={steps} />}
          <ErrorNote error={scanError} />
          <div className="flex justify-end">
            <Button onClick={run} loading={busy} disabled={!selected.length}>
              <GithubIcon /> {t("achievements2.gh.scan")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ dialog */
function AddBody({ initial, onDone, onClose }: { initial: AddMethod; onDone?: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const [method, setMethod] = useState<AddMethod>(initial);
  // Panels stay mounted once visited so switching tabs keeps results; GitHub is only contacted when opened.
  const [visited, setVisited] = useState<AddMethod[]>([initial]);
  const done = () => onDone?.();
  const panel = "data-[state=inactive]:hidden";

  return (
    <DialogContent title={t("ach.add.title")} description={t("achievements2.add.d")} wide={method !== "manual"}>
      <Tabs value={method} onValueChange={(v) => {
          setMethod(v as AddMethod);
          setVisited((list) => (list.includes(v as AddMethod) ? list : [...list, v as AddMethod]));
        }}>
        <TabsList aria-label={t("achievements2.add.methods")}>
          <TabsTrigger value="manual">
            <PenLine aria-hidden /> {t("achievements2.add.tab.manual")}
          </TabsTrigger>
          <TabsTrigger value="text">
            <Sparkles aria-hidden /> {t("achievements2.add.tab.text")}
          </TabsTrigger>
          <TabsTrigger value="document">
            <FileUp aria-hidden /> {t("achievements2.add.tab.document")}
          </TabsTrigger>
          <TabsTrigger value="github">
            <GithubIcon aria-hidden /> {t("achievements2.add.tab.github")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="manual" forceMount className={panel}>
          <ManualForm
            onSaved={() => {
              done();
              onClose();
            }}
          />
        </TabsContent>
        <TabsContent value="text" forceMount className={panel}>
          {visited.includes("text") && <TextExtract onDone={done} />}
        </TabsContent>
        <TabsContent value="document" forceMount className={panel}>
          {visited.includes("document") && <DocumentUpload onDone={done} />}
        </TabsContent>
        <TabsContent value="github" forceMount className={panel}>
          {visited.includes("github") && <GithubScan onDone={done} />}
        </TabsContent>
      </Tabs>
    </DialogContent>
  );
}

/**
 * "Add achievement" dialog: write it yourself, extract from text, from an evidence document, or from GitHub.
 * Pass `trigger` (a single focusable element) or control it with `open` / `onOpenChange`.
 */
export function AddAchievementDialog({
  trigger,
  onDone,
  open: openProp,
  onOpenChange,
  initialMethod = "manual",
}: {
  trigger?: React.ReactNode;
  onDone?: () => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  initialMethod?: AddMethod;
}) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = (o: boolean) => {
    setInner(o);
    onOpenChange?.(o);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      {/* Mounted only while open so every opening starts from a clean state. */}
      {open && <AddBody initial={initialMethod} onDone={onDone} onClose={() => setOpen(false)} />}
    </Dialog>
  );
}
