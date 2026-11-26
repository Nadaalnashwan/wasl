"use client";

import { AlertTriangle, ArrowLeft, Check, FilePlus2, FileText, RotateCcw, ShieldAlert, Upload, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { CVDocument, type DocMarks } from "@/components/cv/document";
import { CVEditor, sectionTitleKey } from "@/components/cv/editor";
import { ExportButtons, TailoredList, type Version, VersionList } from "@/components/cv/history";
import { changedSections, cleanCV, EMPTY_CV, isEmptyCV, normalizeCV, sameCV } from "@/components/cv/model";
import { StaleSuggestions, suggestionMarks, SuggestionReview } from "@/components/cv/suggestions";
import { AiWorking, EmptyState, ErrorNote, Notice, SkeletonRows } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, PageHeader, Section, Status } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api, ApiError, upload } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/providers";
import type { CV, CVData, Suggestion } from "@/lib/types";
import { cn, fmtDate } from "@/lib/utils";

type Pane = "edit" | "preview" | "suggestions" | "history";
type Mode = { kind: "edit" } | { kind: "new" } | { kind: "import"; filename: string; flags: string[]; chars: number; hadMaster: boolean };
type PreviewSrc =
  | { kind: "working" }
  | { kind: "version"; version: number; data: CVData; change_summary: string; created_at: string }
  | { kind: "suggestion"; id: string };

const LG = "(min-width: 1024px)";
function useIsLg() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(LG);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(LG).matches,
    () => false,
  );
}

const fill = (s: string, vars: Record<string, string | number>) => Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);

export default function CVPage() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const isLg = useIsLg();

  const master = useApi<CV | null>("/api/cv/master");
  const suggestions = useApi<Suggestion[]>("/api/cv/suggestions?status=pending");
  const stale = useApi<Suggestion[]>("/api/cv/suggestions?status=stale");
  const versions = useApi<Version[]>("/api/cv/versions");
  const tailored = useApi<CV[]>("/api/cv/tailored");

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = React.useState(false);
  const [uploadErr, setUploadErr] = React.useState<ApiError | null>(null);

  // Working copy: null means "showing the saved Master CV, no edits".
  const [working, setWorking] = React.useState<CVData | null>(null);
  const [baseVersion, setBaseVersion] = React.useState<number | null>(null);
  const [mode, setMode] = React.useState<Mode>({ kind: "edit" });

  const [pane, setPane] = React.useState<Pane>("edit");
  const [preview, setPreview] = React.useState<PreviewSrc>({ kind: "working" });

  const [saveOpen, setSaveOpen] = React.useState(false);
  const [summary, setSummary] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState<{ latest: number | null } | null>(null);
  const [pending, setPending] = React.useState<{ run: () => void } | null>(null);
  const [restoreTarget, setRestoreTarget] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState(false);
  const [staleNotice, setStaleNotice] = React.useState<string | null>(null);

  const saved = master.data ?? null;
  const doc = working ?? (saved ? normalizeCV(saved.data) : null);
  const dirty =
    working !== null && (mode.kind === "import" ? true : mode.kind === "new" ? !isEmptyCV(working) : !sameCV(cleanCV(working), cleanCV(normalizeCV(saved?.data))));
  const unsavedSections = working ? changedSections(cleanCV(normalizeCV(saved?.data ?? EMPTY_CV)), cleanCV(working)) : [];
  const pendingCount = suggestions.data?.length ?? 0;
  const effPane: Pane = isLg && pane === "preview" ? "edit" : pane;

  /* ---------------------------------------------------------------- unsaved-changes guard */
  React.useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ run: () => router.push(url.pathname + url.search + url.hash) });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, router]);

  const discard = () => {
    setWorking(null);
    setBaseVersion(null);
    setMode({ kind: "edit" });
  };
  /** Run an action that would replace the working copy — ask first when there are unsaved edits. */
  const guard = (run: () => void) => (dirty ? setPending({ run }) : run());

  const reloadAll = () => {
    master.reload();
    suggestions.reload();
    stale.reload();
    versions.reload();
  };

  const onEdit = (v: CVData) => {
    if (working === null) setBaseVersion(saved?.version ?? null);
    setWorking(v);
  };

  /* ---------------------------------------------------------------- upload → review */
  async function onFile(f: File | undefined) {
    if (!f) return;
    setParsing(true);
    setUploadErr(null);
    try {
      const res = await upload<{ parsed: CVData; injection_flags: string[]; text_chars?: number; has_master?: boolean }>("/api/cv/upload", f);
      setWorking(normalizeCV(res.parsed));
      setBaseVersion(saved?.version ?? null);
      setMode({ kind: "import", filename: f.name, flags: res.injection_flags ?? [], chars: res.text_chars ?? 0, hadMaster: !!(res.has_master ?? saved) });
      setPreview({ kind: "working" });
      setPane("edit");
    } catch (e) {
      setUploadErr(e as ApiError);
    } finally {
      setParsing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  const pickFile = () => guard(() => fileRef.current?.click());

  /* ---------------------------------------------------------------- save */
  function openSave() {
    setSummary(
      mode.kind === "import" ? fill(t("cv2.save.defaultImport"), { file: mode.filename }) : mode.kind === "new" || !saved ? t("cv2.save.defaultNew") : t("cv2.save.defaultEdit"),
    );
    setSaveOpen(true);
  }

  async function doSave(force = false) {
    if (!working) return;
    setSaving(true);
    try {
      if (!force) {
        const latest = await api<CV | null>("/api/cv/master");
        const latestVersion = latest?.version ?? null;
        if (latestVersion !== baseVersion) {
          setSaveOpen(false);
          setConflict({ latest: latestVersion });
          return;
        }
      }
      // base_version lets the server reject the save if the Master CV changed meanwhile (force = user chose to overwrite)
      await api("/api/cv/master", {
        method: "PUT",
        json: {
          data: cleanCV(working),
          change_summary: summary.trim().slice(0, 300) || t("cv2.save.defaultEdit"),
          ...(!force && baseVersion ? { base_version: baseVersion } : {}),
        },
      });
      toast("ok", t("cv2.save.done"));
      setSaveOpen(false);
      setConflict(null);
      discard();
      setPreview({ kind: "working" });
      reloadAll();
    } catch (e) {
      const err = e as ApiError;
      const d = err.detail as { code?: string; current_version?: number } | undefined;
      if (err.status === 409 && d?.code === "version_conflict") {
        setSaveOpen(false);
        setConflict({ latest: d.current_version ?? null });
      } else toast("error", err.message);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------------------------------------------- versions */
  async function viewVersion(v: number) {
    try {
      const r = await api<{ version: number; data: CVData; change_summary: string; created_at: string }>(`/api/cv/versions/${v}`);
      setPreview({ kind: "version", ...r });
      if (!isLg) setPane("preview");
    } catch (e) {
      toast("error", (e as ApiError).message);
    }
  }

  async function restore() {
    if (restoreTarget == null) return;
    setRestoring(true);
    try {
      await api(`/api/cv/versions/${restoreTarget}/restore`, { method: "POST" });
      toast("ok", fill(t("cv2.hist.restored"), { v: restoreTarget }));
      discard();
      setRestoreTarget(null);
      setPreview({ kind: "working" });
      reloadAll();
    } catch (e) {
      toast("error", (e as ApiError).message);
    } finally {
      setRestoring(false);
    }
  }

  /* ---------------------------------------------------------------- preview content */
  const previewSuggestion = preview.kind === "suggestion" ? suggestions.data?.find((s) => s.id === preview.id) : undefined;
  let previewData: CVData | null = doc;
  let previewMarks: DocMarks | undefined;
  if (preview.kind === "version") previewData = normalizeCV(preview.data);
  if (previewSuggestion) {
    previewData = normalizeCV(previewSuggestion.draft_data);
    previewMarks = suggestionMarks(previewSuggestion);
  }

  const tabs: { k: Pane; label: string; count?: number; mobileOnly?: boolean }[] = [
    { k: "edit", label: t("cv2.tab.edit") },
    { k: "preview", label: t("cv2.tab.preview"), mobileOnly: true },
    { k: "suggestions", label: t("cv2.tab.suggestions"), count: pendingCount },
    { k: "history", label: t("cv2.tab.history") },
  ];
  const visibleTabs = tabs.filter((x) => !(x.mobileOnly && isLg));
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const dir = (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) * (document.dir === "rtl" ? -1 : 1);
    if (!dir) return;
    e.preventDefault();
    const next = visibleTabs[(i + dir + visibleTabs.length) % visibleTabs.length];
    setPane(next.k);
    document.getElementById(`cv-tab-${next.k}`)?.focus();
  };

  const hasWorkspace = !!saved || working !== null;

  /* ---------------------------------------------------------------- render */
  return (
    <div>
      <PageHeader tone="sky" art="cv" title={t("nav.cv")} sub={t("cv2.sub")} />
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {parsing && <AiWorking steps={[t("cv2.parse.s1"), t("cv2.parse.s2"), t("cv2.parse.s3")]} className="mb-6" />}
        {uploadErr && <ErrorNote error={uploadErr} className="mb-6" />}
      </div>

      {master.loading && !saved && working === null && <SkeletonRows rows={4} />}
      {master.error && <ErrorNote error={master.error} onRetry={master.reload} className="mb-6" />}

      {/* ------------------------------------------------ first run: no Master CV yet */}
      {!master.loading && !master.error && !hasWorkspace && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Section title={t("cv2.start.title")} description={t("cv2.start.text")}>
            <ol className="mt-4 flex flex-col divide-y divide-border rounded-xl border border-border bg-surface shadow-sm">
              <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg">{t("cv2.start.upload")}</div>
                  <p className="mt-0.5 text-sm text-fg-3">{t("cv2.start.uploadText")}</p>
                </div>
                <Button onClick={pickFile} loading={parsing}>
                  <Upload /> {t("cv.upload")}
                </Button>
              </li>
              <li className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg">{t("cv.create")}</div>
                  <p className="mt-0.5 text-sm text-fg-3">{t("cv2.start.scratchText")}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setWorking(EMPTY_CV);
                    setBaseVersion(null);
                    setMode({ kind: "new" });
                  }}
                >
                  <FilePlus2 /> {t("cv.create")}
                </Button>
              </li>
            </ol>
          </Section>
          <div className="hidden lg:block">
            <CVDocument data={EMPTY_CV} emptyHint={t("cv2.doc.emptyStart")} label={t("cv2.preview.title")} />
          </div>
        </div>
      )}

      {/* ------------------------------------------------ workspace */}
      {hasWorkspace && doc && (
        <>
          {/* toolbar */}
          <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-border bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 md:top-0 md:-mx-10 md:px-10">
            <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-56" aria-live="polite">
                {mode.kind === "import" ? (
                  <Status tone="warn">{t("cv2.status.import")}</Status>
                ) : dirty ? (
                  <Status tone="warn">{t("cv2.status.unsaved")}</Status>
                ) : saved ? (
                  <Status tone="ok">{fill(t("cv2.status.saved"), { v: saved.version })}</Status>
                ) : (
                  <Status>{t("cv2.status.new")}</Status>
                )}
                <div className="mt-0.5 truncate text-xs text-fg-3">
                  {dirty && unsavedSections.length > 0
                    ? `${t("cv2.save.changes")} ${unsavedSections.map((k) => t(sectionTitleKey(k))).join(", ")}`
                    : saved
                      ? fill(t("cv2.status.updated"), { date: fmtDate(saved.updated_at, locale) })
                      : t("cv2.status.notSaved")}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={pickFile} loading={parsing}>
                  {!parsing && <Upload />} {t("cv2.toolbar.upload")}
                </Button>
                {saved && (
                  <div className="flex items-center gap-2">
                    <ExportButtons cv={saved} />
                  </div>
                )}
                {working !== null && (dirty || mode.kind !== "edit") && (
                  <Button size="sm" variant="ghost" onClick={() => (dirty ? setPending({ run: () => undefined }) : discard())}>
                    <X /> {t("cv2.toolbar.discard")}
                  </Button>
                )}
                <Button size="sm" onClick={openSave} disabled={!dirty}>
                  <Check /> {mode.kind === "import" || !saved ? t("cv.review.save") : t("cv2.toolbar.save")}
                </Button>
              </div>
            </div>
            {saved && dirty && <p className="mx-auto mt-1 max-w-[1120px] text-end text-[11px] text-fg-3">{fill(t("cv2.export.savedOnly"), { v: saved.version })}</p>}
          </div>

          {mode.kind === "import" && (
            <div className="mb-6 flex flex-col gap-3">
              <Notice tone="info" icon={<FileText />} title={fill(t("cv2.import.title"), { file: mode.filename })}>
                {t("cv2.import.text")} {mode.hadMaster && saved ? fill(t("cv2.import.replace"), { v: saved.version, next: saved.version + 1 }) : ""}
              </Notice>
              {mode.flags.length > 0 && (
                <Notice tone="warn" icon={<ShieldAlert />} title={t("cv2.import.flagsTitle")}>
                  <p>{t("cv2.import.flagsText")}</p>
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs font-medium">{fill(t("cv2.import.flagsList"), { n: mode.flags.length })}</summary>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {mode.flags.map((f) => (
                        <li key={f}>
                          <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px] text-fg-2">{f}</code>
                        </li>
                      ))}
                    </ul>
                  </details>
                </Notice>
              )}
            </div>
          )}

          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
            {/* left: tabs + context pane */}
            <div className="min-w-0">
              <div role="tablist" aria-label={t("cv2.tab.label")} className="mb-5 flex gap-5 border-b border-border">
                {visibleTabs.map((tab, i) => {
                  const sel = effPane === tab.k;
                  return (
                    <button
                      key={tab.k}
                      id={`cv-tab-${tab.k}`}
                      type="button"
                      role="tab"
                      aria-selected={sel}
                      aria-controls={`cv-panel-${tab.k}`}
                      tabIndex={sel ? 0 : -1}
                      onClick={() => setPane(tab.k)}
                      onKeyDown={(e) => onTabKey(e, i)}
                      className={cn(
                        "-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 pb-2.5 text-sm font-medium transition-colors",
                        sel ? "border-primary text-fg" : "border-transparent text-fg-3 hover:text-fg",
                      )}
                    >
                      {tab.label}
                      {!!tab.count && (
                        <Badge tone="warn" className="num">
                          {tab.count}
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>

              {effPane === "edit" && (
                <div role="tabpanel" id="cv-panel-edit" aria-labelledby="cv-tab-edit">
                  <CVEditor value={doc} onChange={onEdit} defaultOpen={mode.kind === "edit" ? ["contact", "summary"] : ["contact", "summary", "experience"]} />
                </div>
              )}

              {effPane === "suggestions" && (
                <div role="tabpanel" id="cv-panel-suggestions" aria-labelledby="cv-tab-suggestions" className="flex flex-col gap-5">
                  <p className="text-sm text-fg-2">{t("cv2.sug.intro")}</p>
                  {staleNotice && (
                    <Notice tone="warn" icon={<AlertTriangle />} title={t("cv2.sug.staleTitle")}>
                      <p>{staleNotice}</p>
                      <p className="mt-1">{t("cv2.sug.staleExplain")}</p>
                      <div className="mt-2 flex gap-3">
                        <Link href="/achievements" className="text-sm font-medium text-primary-text hover:underline">
                          {t("cv2.sug.regenerate")}
                        </Link>
                        <button type="button" className="text-sm text-fg-3 hover:text-fg" onClick={() => setStaleNotice(null)}>
                          {t("common.close")}
                        </button>
                      </div>
                    </Notice>
                  )}
                  {suggestions.error && <ErrorNote error={suggestions.error} onRetry={suggestions.reload} />}
                  {suggestions.loading && !suggestions.data && <SkeletonRows rows={2} />}
                  {saved && suggestions.data?.map((s) => (
                    <SuggestionReview
                      key={s.id}
                      s={s}
                      master={saved}
                      previewing={preview.kind === "suggestion" && preview.id === s.id}
                      onPreview={() => {
                        if (preview.kind === "suggestion" && preview.id === s.id) setPreview({ kind: "working" });
                        else {
                          setPreview({ kind: "suggestion", id: s.id });
                          if (!isLg) setPane("preview");
                        }
                      }}
                      guard={guard}
                      onResolved={(kind, msg) => {
                        if (preview.kind === "suggestion" && preview.id === s.id) setPreview({ kind: "working" });
                        if (kind === "stale") {
                          setStaleNotice(msg ?? t("cv2.sug.outdatedTitle"));
                          suggestions.reload();
                          stale.reload();
                        } else {
                          if (kind === "accepted") discard();
                          reloadAll();
                        }
                      }}
                    />
                  ))}
                  {suggestions.data && suggestions.data.length === 0 && (
                    <EmptyState title={t("cv2.sug.emptyTitle")} text={t("cv2.sug.emptyText")} action={
                      <Button asChild variant="secondary" size="sm">
                        <Link href="/achievements">{t("cv2.sug.toAchievements")}</Link>
                      </Button>
                    } />
                  )}
                  <StaleSuggestions items={stale.data ?? []} />
                </div>
              )}

              {effPane === "history" && (
                <div role="tabpanel" id="cv-panel-history" aria-labelledby="cv-tab-history" className="flex flex-col gap-10">
                  <Section title={t("cv.history")} description={t("cv2.hist.text")}>
                    {versions.error && <ErrorNote error={versions.error} onRetry={versions.reload} />}
                    {versions.loading && !versions.data ? (
                      <SkeletonRows rows={2} />
                    ) : (
                      <VersionList
                        versions={versions.data ?? []}
                        current={saved?.version}
                        viewing={preview.kind === "version" ? preview.version : null}
                        onView={viewVersion}
                        onRestore={(v) => setRestoreTarget(v)}
                      />
                    )}
                  </Section>
                  <Section
                    title={t("cv.tailored")}
                    description={t("cv2.tailored.text")}
                    action={
                      <Button asChild variant="link" size="sm">
                        <Link href="/tailor">{t("cv2.tailored.new")}</Link>
                      </Button>
                    }
                  >
                    {tailored.error && <ErrorNote error={tailored.error} onRetry={tailored.reload} />}
                    <TailoredList items={tailored.data ?? []} onDeleted={tailored.reload} />
                  </Section>
                </div>
              )}
            </div>

            {/* right: live document preview */}
            <aside
              id="cv-panel-preview"
              role={isLg ? "complementary" : "tabpanel"}
              aria-labelledby={isLg ? undefined : "cv-tab-preview"}
              aria-label={isLg ? t("cv2.preview.title") : undefined}
              className={cn("min-w-0", pane === "preview" || isLg ? "block" : "hidden", "lg:sticky lg:top-24 lg:self-start")}
            >
              <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2" aria-live="polite">
                {preview.kind === "version" ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg">
                        {fill(t("cv2.preview.version"), { v: preview.version })}{" "}
                        <span className="num font-normal text-fg-3">· {fmtDate(preview.created_at, locale)}</span>
                      </div>
                      <div className="truncate text-xs text-fg-3">{preview.change_summary}</div>
                    </div>
                    {preview.version !== saved?.version && (
                      <Button size="xs" variant="secondary" onClick={() => setRestoreTarget(preview.version)}>
                        <RotateCcw /> {t("cv.restore")}
                      </Button>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => setPreview({ kind: "working" })}>
                      <ArrowLeft className="rtl:rotate-180" /> {t("cv2.preview.back")}
                    </Button>
                  </>
                ) : previewSuggestion ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg">{t("cv2.preview.suggestion")}</div>
                      <div className="text-xs text-fg-3">{t("cv2.preview.suggestionHint")}</div>
                    </div>
                    <Button size="xs" variant="ghost" onClick={() => setPreview({ kind: "working" })}>
                      <ArrowLeft className="rtl:rotate-180" /> {t("cv2.preview.back")}
                    </Button>
                  </>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">{t("cv2.preview.title")}</div>
                    <div className="text-xs text-fg-3">{dirty ? t("cv2.preview.unsaved") : t("cv2.preview.saved")}</div>
                  </div>
                )}
              </div>
              <div
                className="lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:rounded-md lg:pb-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                role="region"
                aria-label={t("cv2.preview.title")}
                tabIndex={0}
              >
                {previewData && <CVDocument data={previewData} marks={previewMarks} label={t("cv2.preview.title")} />}
              </div>
            </aside>
          </div>
        </>
      )}

      {/* ------------------------------------------------ dialogs */}
      <ConfirmDialog
        open={saveOpen}
        onOpenChange={(o) => !saving && setSaveOpen(o)}
        title={mode.kind === "import" || !saved ? t("cv.review.save") : t("cv2.save.title")}
        description={saved ? fill(t("cv2.save.versionLine"), { v: saved.version, next: saved.version + 1 }) : t("cv2.save.firstLine")}
        confirmLabel={mode.kind === "import" || !saved ? t("cv.review.save") : t("cv2.toolbar.save")}
        cancelLabel={t("common.cancel")}
        loading={saving}
        onConfirm={() => doSave(false)}
      >
        <div className="flex flex-col gap-4">
          <Field label={t("cv2.save.summary")} hint={t("cv2.save.summaryHint")}>
            <Input value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={300} dir="auto" />
          </Field>
          {unsavedSections.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-fg-3">{t("cv2.save.changes")}</div>
              <ul className="flex flex-wrap gap-1">
                {unsavedSections.map((k) => (
                  <li key={k}>
                    <Badge tone="outline">{t(sectionTitleKey(k))}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mode.kind === "import" && saved && <Notice tone="warn">{fill(t("cv2.import.replace"), { v: saved.version, next: saved.version + 1 })}</Notice>}
          {saved && pendingCount > 0 && <p className="text-xs text-fg-3">{t("cv2.save.staleWarn")}</p>}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!conflict}
        onOpenChange={(o) => !o && !saving && setConflict(null)}
        title={t("cv2.conflict.title")}
        description={fill(t("cv2.conflict.text"), { base: baseVersion ?? "—", latest: conflict?.latest ?? "—" })}
        confirmLabel={t("cv2.conflict.overwrite")}
        cancelLabel={t("common.cancel")}
        destructive
        loading={saving}
        onConfirm={() => doSave(true)}
      >
        <p className="text-sm text-fg-2">{t("cv2.conflict.help")}</p>
        <Button
          variant="link"
          className="mt-2"
          onClick={() => {
            setConflict(null);
            discard();
            reloadAll();
          }}
        >
          {t("cv2.conflict.load")}
        </Button>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={t("cv2.discard.title")}
        description={t("cv2.discard.text")}
        confirmLabel={t("cv2.discard.confirm")}
        cancelLabel={t("cv2.discard.keep")}
        destructive
        onConfirm={() => {
          const run = pending?.run;
          setPending(null);
          discard();
          setPreview({ kind: "working" });
          run?.();
        }}
      />

      <ConfirmDialog
        open={restoreTarget != null}
        onOpenChange={(o) => !o && !restoring && setRestoreTarget(null)}
        title={fill(t("cv2.restore.title"), { v: restoreTarget ?? "" })}
        description={fill(t("cv2.restore.text"), { v: restoreTarget ?? "", next: (saved?.version ?? 0) + 1 })}
        confirmLabel={t("cv.restore")}
        cancelLabel={t("common.cancel")}
        loading={restoring}
        onConfirm={restore}
      >
        {dirty && <Notice tone="warn">{t("cv2.restore.dirty")}</Notice>}
      </ConfirmDialog>
    </div>
  );
}
