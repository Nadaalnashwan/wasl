"use client";

import { useState } from "react";
import type { ClaimReport } from "@/components/claims";
import { Editor } from "@/components/studio/editor";
import {
  asReport,
  type EvaluationResult,
  type Improved,
  isEditable,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  type SourceMode,
  type StudioPost,
  type Tone,
} from "@/components/studio/model";
import { PreviewPanel } from "@/components/studio/preview";
import { PublishDialog } from "@/components/studio/publish-dialog";
import { SourcePanel } from "@/components/studio/source-panel";
import { PageHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import { useAuth, useToast } from "@/lib/providers";
import type { Achievement, IntegrationStatus } from "@/lib/types";

export default function StudioPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();

  const posts = useApi<StudioPost[]>("/api/posts");
  const integrations = useApi<Record<string, IntegrationStatus>>("/api/integrations");
  const achievements = useApi<Achievement[]>("/api/achievements?status=confirmed");

  // source + generation controls
  const [mode, setMode] = useState<SourceMode>("achievement");
  const [achievementId, setAchievementId] = useState<string | null>(null);
  const [free, setFree] = useState("");
  const [draftText, setDraftText] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [lang, setLang] = useState<"en" | "ar">(locale);
  const [instructions, setInstructions] = useState("");

  // editor
  const [current, setCurrent] = useState<StudioPost | null>(null);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [improved, setImproved] = useState<Improved | null>(null);

  // async + dialogs
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dialogReport, setDialogReport] = useState<ClaimReport | null>(null);
  const [serverClaimMsg, setServerClaimMsg] = useState<string | null>(null);
  const [notConnected, setNotConnected] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<StudioPost | null>(null);

  // "Evaluate for CV" (extract achievements from the description)
  const [evaluated, setEvaluated] = useState<EvaluationResult | null>(null);
  const [evaluatedText, setEvaluatedText] = useState("");
  const [contributionNotes, setContributionNotes] = useState<Record<string, string>>({});

  const linkedin = integrations.data?.linkedin;
  const editable = isEditable(current);
  const tagsDirty = !!current && JSON.stringify(tags) !== JSON.stringify(current.hashtags ?? []);
  const dirty = !!current && (content !== current.content || tagsDirty);
  const evaluationIsCurrent = evaluated !== null && evaluatedText === free.trim();
  const sourceLabel = current?.achievement_id ? (achievements.data?.find((a) => a.id === current.achievement_id)?.title ?? null) : null;

  const aiSteps =
    busy === "evaluate"
      ? [t("studio2.steps.analyze"), t("studio2.steps.extract"), t("studio2.steps.review")]
      : busy === "generate" || busy === "improve"
        ? [t("studio2.steps.write"), t("studio2.steps.check"), t("studio2.steps.revise")]
        : null;

  function load(p: StudioPost) {
    setCurrent(p);
    setContent(p.content);
    setTags(p.hashtags ?? []);
    setImproved(null);
    setNotConnected(null);
  }

  function newDraft() {
    setCurrent(null);
    setContent("");
    setTags([]);
  }

  /** Keep the editor in sync with a fresh server copy without discarding unsaved text. */
  function replaceCurrent(p: StudioPost, keepEdits = false) {
    setCurrent(p);
    if (!keepEdits) {
      setContent(p.content);
      setTags(p.hashtags ?? []);
    }
  }

  async function generate() {
    if (busy !== null) return;
    const fromAchievement = mode === "achievement";
    if (fromAchievement ? !achievementId : free.trim().length < 20) return;
    setBusy("generate");
    setError(null);
    try {
      const p = await api<StudioPost>("/api/posts/generate", {
        method: "POST",
        json: {
          achievement_id: fromAchievement ? achievementId : null,
          text: fromAchievement ? null : free,
          tone,
          language: lang,
          instructions,
        },
      });
      load(p);
      posts.reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function improve() {
    if (busy !== null || draftText.trim().length < 20) return;
    setBusy("improve");
    setError(null);
    try {
      setImproved(await api<Improved>("/api/posts/improve", { method: "POST", json: { content: draftText, tone, language: lang } }));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function evaluateAchievement() {
    const text = free.trim();
    if (text.length < 20 || busy !== null) return;
    setBusy("evaluate");
    setError(null);
    setEvaluated(null);
    setEvaluatedText("");
    try {
      const result = await api<EvaluationResult>("/api/achievements/extract", { method: "POST", json: { text } });
      setEvaluated(result);
      setEvaluatedText(text);
      if (result.candidates.length > 0) toast("ok", t("studio2.eval.extracted"));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function reviewAchievement(a: Achievement, action: "confirm" | "reject") {
    if (busy !== null) return;
    const note = (contributionNotes[a.id] ?? a.contribution_note ?? "").trim();
    if (action === "confirm" && a.needs_contribution_confirmation && note.length < 10) {
      toast("error", t("studio2.eval.contribution.short"));
      return;
    }
    setBusy(a.id);
    setError(null);
    try {
      if (action === "confirm") {
        const result = await api<{ achievement: Achievement; cv_update: unknown }>(`/api/achievements/${a.id}/confirm`, {
          method: "POST",
          json: { contribution_note: note, auto_cv_update: true },
        });
        toast("ok", result.cv_update ? t("studio2.eval.confirmed.cv") : t("studio2.eval.confirmed"));
        achievements.reload();
      } else {
        await api(`/api/achievements/${a.id}/reject`, { method: "POST" });
        toast("ok", t("studio2.eval.rejected"));
      }
      setEvaluated((prev) => (prev ? { ...prev, candidates: prev.candidates.filter((x) => x.id !== a.id) } : null));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function patchBody() {
    return { content, ...(tagsDirty ? { hashtags: tags } : {}) };
  }

  async function saveEdits() {
    if (!current || !editable || busy !== null) return;
    setBusy("save");
    try {
      const p = await api<StudioPost>(`/api/posts/${current.id}`, { method: "PATCH", json: patchBody() });
      replaceCurrent(p);
      posts.reload();
      toast("ok", t("studio2.saved"));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadImages(files: FileList | null) {
    if (!current || !editable || !files?.length || busy !== null) return;
    const selected = Array.from(files);
    if ((current.images?.length ?? 0) + selected.length > MAX_IMAGES) {
      toast("error", t("studio2.images.max"));
      return;
    }
    if (selected.some((f) => !["image/jpeg", "image/png"].includes(f.type) || f.size === 0 || f.size > MAX_IMAGE_BYTES)) {
      toast("error", t("studio2.images.invalid"));
      return;
    }
    const form = new FormData();
    selected.forEach((f) => form.append("files", f));
    setBusy("images");
    try {
      const updated = await api<StudioPost>(`/api/posts/${current.id}/images`, { method: "POST", body: form });
      replaceCurrent(updated, true);
      posts.reload();
      toast("ok", t("studio2.images.uploaded"));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteImage(imageId: string) {
    if (!current || !editable || busy !== null) return;
    setBusy("images");
    try {
      await api(`/api/posts/${current.id}/images/${imageId}`, { method: "DELETE" });
      const all = await api<StudioPost[]>("/api/posts");
      const fresh = all.find((p) => p.id === current.id);
      if (fresh) replaceCurrent(fresh, true);
      posts.setData(all);
      toast("ok", t("studio2.images.removed"));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function openPublish() {
    if (!current) return;
    setDialogReport(asReport(current.claim_check));
    setServerClaimMsg(null);
    setConfirmOpen(true);
  }

  async function publish(opts: { acknowledgeClaims: boolean; confirmNotPublished: boolean }) {
    if (!current || busy !== null) return;
    setBusy("publish");
    let keepOpen = false;
    try {
      if (dirty && editable) {
        const saved = await api<StudioPost>(`/api/posts/${current.id}`, { method: "PATCH", json: patchBody() });
        replaceCurrent(saved);
      }
      const p = await api<StudioPost>(`/api/posts/${current.id}/publish`, {
        method: "POST",
        json: { confirm: true, confirm_not_published: opts.confirmNotPublished, acknowledge_unverified_claims: opts.acknowledgeClaims },
      });
      replaceCurrent(p);
      toast("ok", t("studio2.published"));
    } catch (e) {
      const err = e as ApiError;
      const detail = err.detail as { code?: string; claim_check?: ClaimReport; post?: StudioPost; message?: string } | undefined;
      if (err.status === 409 && detail?.code === "unverified_claims") {
        // The server re-verified the final text: show its report and require the acknowledgement.
        keepOpen = true;
        setDialogReport(asReport(detail.claim_check) ?? dialogReport);
        setServerClaimMsg(detail.message ?? err.message);
      } else if (err.status === 412) {
        setNotConnected(err.message);
        toast("error", err.message);
        integrations.reload();
      } else {
        toast("error", err.message);
      }
      if (detail?.post) replaceCurrent(detail.post);
    } finally {
      setBusy(null);
      if (!keepOpen) setConfirmOpen(false);
      posts.reload();
    }
  }

  async function confirmDelete() {
    const p = toDelete;
    if (!p) return;
    setBusy("delete");
    try {
      await api(`/api/posts/${p.id}`, { method: "DELETE" });
      if (current?.id === p.id) newDraft();
      posts.reload();
      toast("ok", t("studio2.deleted"));
      setToDelete(null);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader title={t("studio.title")} sub={t("studio.sub")} />

      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_19rem] xl:gap-7">
        <aside aria-label={t("studio.source")} className="min-w-0 lg:row-span-2 xl:row-span-1">
          <SourcePanel
            mode={mode}
            setMode={setMode}
            achievements={achievements}
            achievementId={achievementId}
            setAchievementId={setAchievementId}
            free={free}
            setFree={setFree}
            draftText={draftText}
            setDraftText={setDraftText}
            tone={tone}
            setTone={setTone}
            lang={lang}
            setLang={setLang}
            instructions={instructions}
            setInstructions={setInstructions}
            busy={busy}
            onGenerate={generate}
            onImprove={improve}
            onEvaluate={evaluateAchievement}
            evaluated={evaluated}
            evaluationIsCurrent={evaluationIsCurrent}
            contributionNotes={contributionNotes}
            setContributionNote={(id, v) => setContributionNotes((n) => ({ ...n, [id]: v }))}
            onReview={reviewAchievement}
          />
        </aside>

        <div className="min-w-0">
          <Editor
            posts={posts.data}
            current={current}
            onSelect={load}
            onNew={newDraft}
            content={content}
            setContent={setContent}
            tags={tags}
            setTags={setTags}
            dirty={dirty}
            editable={editable}
            busy={busy}
            error={error}
            onSave={saveEdits}
            onCopy={(text) => {
              navigator.clipboard.writeText(text);
              toast("ok", t("common.copied"));
            }}
            onDelete={setToDelete}
            onUpload={(f) => void uploadImages(f)}
            onDeleteImage={(id) => void deleteImage(id)}
            improved={improved}
            onDismissImproved={() => setImproved(null)}
            sourceLabel={sourceLabel}
            aiSteps={aiSteps}
          />
        </div>

        <aside aria-label={t("studio.preview")} className="min-w-0 lg:col-start-2 xl:col-start-3 xl:row-start-1">
          <div className="xl:sticky xl:top-6">
            <PreviewPanel
              user={user}
              post={current}
              content={content}
              tags={tags}
              dirty={dirty}
              busy={busy}
              linkedin={linkedin}
              notConnected={notConnected}
              onPublish={openPublish}
            />
          </div>
        </aside>
      </div>

      {current && (
        <PublishDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          post={current}
          content={content}
          tags={tags}
          report={dialogReport}
          serverMessage={serverClaimMsg}
          busy={busy === "publish"}
          onConfirm={publish}
        />
      )}

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t("studio2.delete.title")}
        description={t("studio2.delete.d")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        onConfirm={confirmDelete}
        loading={busy === "delete"}
        destructive
      >
        {toDelete && (
          <p className="line-clamp-4 rounded-lg bg-surface-2 px-3 py-2 text-sm text-fg-2" dir="auto">
            {toDelete.content}
          </p>
        )}
      </ConfirmDialog>
    </div>
  );
}
