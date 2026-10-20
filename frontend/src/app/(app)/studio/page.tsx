"use client";

import { AlertTriangle, Check, Copy, ExternalLink, Save, Send, ShieldCheck, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LinkedinIcon } from "@/components/brand-icons";
import { AiWorking, EmptyState, ErrorNote } from "@/components/feedback";
import { MonitorArt } from "@/components/sketch/illustrations";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Field, Segmented, Select, Textarea } from "@/components/ui/form";
import { Dialog, DialogContent, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/overlay";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth, useToast } from "@/lib/providers";
import type { Achievement, ClaimCheck, IntegrationStatus, Post } from "@/lib/types";
import { cn, isArabic, timeAgo } from "@/lib/utils";

const TONES = ["professional", "inspiring", "storytelling", "concise", "humble", "technical"] as const;
type Tone = (typeof TONES)[number];

function ClaimPanel({ check }: { check: ClaimCheck | undefined }) {
  const { t } = useI18n();
  if (!check || check.claims_checked === undefined) return null;
  return (
    <div className={cn("sketch-soft flex flex-col gap-2 p-3 text-sm", check.passed ? "bg-ok-fill" : "bg-warn-fill")}>
      <div className="flex items-center gap-2 font-hand text-lg">
        {check.passed ? <ShieldCheck className="size-5" /> : <AlertTriangle className="size-5" />}
        {check.passed ? t("studio.claims.ok") : t("studio.claims.bad")}
      </div>
      <div className="text-xs text-ink-soft">
        {check.claims_checked} claims checked
        {check.revisions ? ` · auto-revised ${check.revisions}×` : ""}
        {check.provider ? ` · ${check.provider}` : ""}
        {check.fallback_used ? " (fallback)" : ""}
      </div>
      {!check.passed && (
        <div className="flex flex-wrap gap-1.5">
          {check.unsupported.map((u) => (
            <Badge key={u.type + u.value} tone="bad">
              {u.type}: {u.value}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export default function StudioPage() {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const achievements = useApi<Achievement[]>("/api/achievements?status=confirmed");
  const posts = useApi<Post[]>("/api/posts");
  const integrations = useApi<Record<string, IntegrationStatus>>("/api/integrations");

  const [achId, setAchId] = useState<string>("");
  const [free, setFree] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [lang, setLang] = useState<"en" | "ar">(locale);
  const [instructions, setInstructions] = useState("");
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [current, setCurrent] = useState<Post | null>(null);
  const [content, setContent] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [improved, setImproved] = useState<{ content: string; hashtags: string[]; claim_check: ClaimCheck } | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("achievement");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- preselect from ?achievement= deep link
    if (id) setAchId(id);
  }, []);

  const linkedin = integrations.data?.linkedin;
  const dirty = current && content !== current.content;

  function load(p: Post) {
    setCurrent(p);
    setContent(p.content);
    setImproved(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generate() {
    setBusy("generate");
    setError(null);
    try {
      const p = await api<Post>("/api/posts/generate", {
        method: "POST",
        json: { achievement_id: achId || null, text: achId ? null : free, tone, language: lang, instructions },
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
    setBusy("improve");
    setError(null);
    try {
      setImproved(await api("/api/posts/improve", { method: "POST", json: { content: draftText, tone, language: lang } }));
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function saveEdits() {
    if (!current) return;
    setBusy("save");
    try {
      const p = await api<Post>(`/api/posts/${current.id}`, { method: "PATCH", json: { content } });
      setCurrent(p);
      posts.reload();
      toast("ok", locale === "ar" ? "تم الحفظ" : "Saved");
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function publish(confirmNotPublished = false) {
    if (!current) return;
    setBusy("publish");
    try {
      if (dirty) await api<Post>(`/api/posts/${current.id}`, { method: "PATCH", json: { content } });
      const p = await api<Post>(`/api/posts/${current.id}/publish`, { method: "POST", json: { confirm: true, confirm_not_published: confirmNotPublished } });
      setCurrent(p);
      toast("ok", locale === "ar" ? "تم النشر على LinkedIn ✓" : "Published on LinkedIn ✓");
    } catch (e) {
      const err = e as ApiError;
      toast("error", err.message);
      const detail = err.detail as { post?: Post } | undefined;
      if (detail?.post) setCurrent(detail.post);
    } finally {
      setBusy(null);
      setConfirmOpen(false);
      posts.reload();
    }
  }

  async function remove(p: Post) {
    try {
      await api(`/api/posts/${p.id}`, { method: "DELETE" });
      if (current?.id === p.id) {
        setCurrent(null);
        setContent("");
      }
      posts.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  const canGenerate = achId || free.trim().length >= 20;
  const steps = locale === "ar" ? ["كتابة", "فحص الادعاءات", "مراجعة"] : ["write", "check claims", "revise if needed"];

  return (
    <div>
      <PageHeader title={t("studio.title")} sub={t("studio.sub")} art={<MonitorArt className="h-28 w-auto" text={locale === "ar" ? "منشور…" : "post…"} />} />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* ---------------- composer */}
        <Card>
          <Tabs defaultValue="generate">
            <TabsList>
              <TabsTrigger value="generate">
                <Sparkles className="me-1 inline size-4" /> {t("studio.generate")}
              </TabsTrigger>
              <TabsTrigger value="improve">
                <Wand2 className="me-1 inline size-4" /> {t("studio.improve")}
              </TabsTrigger>
            </TabsList>
            <div className="flex flex-col gap-5">
              <TabsContent value="generate" className="flex flex-col gap-5">
                <Field label={t("studio.pick")} htmlFor="ach">
                  <Select id="ach" value={achId} onChange={(e) => setAchId(e.target.value)}>
                    <option value="">—</option>
                    {achievements.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title}
                      </option>
                    ))}
                  </Select>
                </Field>
                {!achId && (
                  <Field label={t("studio.free")}>
                    <Textarea value={free} onChange={(e) => setFree(e.target.value)} maxLength={4000} placeholder={locale === "ar" ? "مثال: أنهيت مشروع تخرجي…" : "e.g. I shipped my graduation project…"} />
                  </Field>
                )}
                <Field label={t("studio.instructions")}>
                  <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} className="min-h-16" maxLength={500} />
                </Field>
              </TabsContent>
              <TabsContent value="improve" className="flex flex-col gap-5">
                <Field label={locale === "ar" ? "مسودتك" : "Your draft"}>
                  <Textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} className="min-h-40" maxLength={3000} dir="auto" />
                </Field>
              </TabsContent>

              <Field group label={t("studio.tone")}>
                <Segmented ariaLabel={t("studio.tone")} value={tone} onChange={setTone} options={TONES.map((x) => ({ value: x, label: t(`tone.${x}` as TKey) }))} />
              </Field>
              <Field group label={t("studio.language")}>
                <Segmented ariaLabel={t("studio.language")} value={lang} onChange={setLang} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]} />
              </Field>
              <ErrorNote error={error} />
              {(busy === "generate" || busy === "improve") && <AiWorking steps={steps} />}
              <TabsContent value="generate">
                <Button className="w-full" size="lg" onClick={generate} loading={busy === "generate"} disabled={!canGenerate}>
                  <Sparkles /> {t("studio.generate")}
                </Button>
              </TabsContent>
              <TabsContent value="improve" className="flex flex-col gap-4">
                <Button className="w-full" size="lg" onClick={improve} loading={busy === "improve"} disabled={draftText.trim().length < 20}>
                  <Wand2 /> {t("studio.improve")}
                </Button>
                {improved && (
                  <div className="flex flex-col gap-3">
                    <div className="sketch-soft whitespace-pre-wrap bg-paper-2 p-4 text-sm" dir="auto">
                      {improved.content}
                      <div className="mt-2 text-brand">{improved.hashtags.join(" ")}</div>
                    </div>
                    <ClaimPanel check={improved.claim_check} />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(improved.content + "\n\n" + improved.hashtags.join(" "));
                        toast("ok", t("common.copied"));
                      }}
                    >
                      <Copy /> {t("common.copy")}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </Card>

        {/* ---------------- preview & publish */}
        <Card tone="tint" className="flex flex-col gap-4">
          <CardTitle icon={<LinkedinIcon />}>{t("studio.preview")}</CardTitle>
          {!current ? (
            <EmptyState title={t("studio.empty")} />
          ) : (
            <>
              <div className="sketch bg-paper p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-full border-2 border-ink bg-sky font-hand text-lg">
                    {(user?.full_name || user?.email || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold">{user?.full_name || user?.email}</div>
                    <div className="truncate text-xs text-ink-faint">{user?.headline || "LinkedIn member"} · 🌐</div>
                  </div>
                  <Badge className="ms-auto" tone={current.status === "published" ? "ok" : current.status === "failed" || current.status === "uncertain" ? "bad" : "neutral"}>
                    {t(`post.status.${current.status}` as TKey)}
                  </Badge>
                </div>
                <Textarea
                  aria-label="Post content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={current.status === "published"}
                  dir={isArabic(content) ? "rtl" : "ltr"}
                  className="min-h-64 border-dashed bg-paper"
                  maxLength={3000}
                />
                <div className="mt-2 flex flex-wrap gap-1.5 text-sm text-brand">{current.hashtags.join(" ")}</div>
                <div className="mt-1 text-end text-xs text-ink-faint">{content.length} / 3000</div>
              </div>
              <ClaimPanel check={current.claim_check} />
              {current.publish_error && (
                <div className="sketch-soft bg-bad-fill p-3 text-sm" role="alert">
                  {current.publish_error}
                </div>
              )}
              {current.status === "published" && current.linkedin_post_urn && (
                <a className="inline-flex items-center gap-2 text-sm font-bold underline" href={`https://www.linkedin.com/feed/update/${current.linkedin_post_urn}/`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" /> {current.linkedin_post_urn}
                </a>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={saveEdits} loading={busy === "save"} disabled={!dirty}>
                  <Save /> {t("common.save")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(content + "\n\n" + current.hashtags.join(" "));
                    toast("ok", t("common.copied"));
                  }}
                >
                  <Copy /> {t("common.copy")}
                </Button>
                {current.status !== "published" && (
                  <Button size="sm" className="ms-auto" disabled={!linkedin?.connected || busy === "publish"} onClick={() => setConfirmOpen(true)}>
                    <Send className="rtl:-scale-x-100" /> {t("studio.publish")}
                  </Button>
                )}
              </div>
              {!linkedin?.connected && (
                <p className="sketch-dashed flex items-center gap-2 p-3 text-sm text-ink-soft">
                  <LinkedinIcon className="size-5 shrink-0" />
                  {linkedin?.configured_on_server === false ? t("studio.linkedin.unconfigured") : t("studio.linkedin.off")}
                  <Link href="/settings" className="ms-auto font-bold underline">
                    {t("nav.settings")}
                  </Link>
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ---------------- drafts */}
      <h2 className="mt-12 mb-4 font-hand text-3xl">{t("studio.drafts")}</h2>
      {posts.data?.length === 0 && <p className="text-sm text-ink-soft">{t("common.none")}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.data?.map((p) => (
          <div key={p.id} className={cn("sketch flex flex-col gap-3 p-4", current?.id === p.id && "!bg-sky")}>
            <div className="flex items-center gap-2">
              <Badge tone={p.status === "published" ? "ok" : p.status === "draft" ? "neutral" : "bad"}>{t(`post.status.${p.status}` as TKey)}</Badge>
              <Badge>{t(`tone.${p.tone}` as TKey)}</Badge>
              {p.claim_check?.passed ? <Check className="size-4 text-ok" aria-label="claims ok" /> : <AlertTriangle className="size-4 text-warn" aria-label="unsupported claims" />}
              <span className="ms-auto text-xs text-ink-faint">{timeAgo(p.updated_at)}</span>
            </div>
            <p className="line-clamp-4 text-sm" dir="auto">
              {p.content}
            </p>
            <div className="mt-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => load(p)}>
                {t("common.edit")}
              </Button>
              {p.status !== "published" && (
                <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label={t("common.delete")}>
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---------------- explicit publish confirmation */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent title={t("studio.publish")} description={t("studio.publish.confirm")}>
          <div className="sketch-soft mb-4 max-h-60 overflow-y-auto whitespace-pre-wrap bg-paper-2 p-3 text-sm" dir="auto">
            {content}
          </div>
          {current?.claim_check && !current.claim_check.passed && (
            <div className="mb-4">
              <ClaimPanel check={current.claim_check} />
            </div>
          )}
          {current?.status === "uncertain" && (
            <p className="mb-4 rounded-lg bg-warn-fill p-3 text-sm">
              {locale === "ar"
                ? "المحاولة السابقة ربما نجحت. تأكد من حسابك على LinkedIn قبل إعادة النشر لتجنب التكرار."
                : "The previous attempt may have succeeded. Check your LinkedIn profile first to avoid a duplicate post."}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => publish(current?.status === "uncertain")} loading={busy === "publish"}>
              <Send className="rtl:-scale-x-100" /> {current?.status === "uncertain" ? (locale === "ar" ? "لم يُنشر — أعد المحاولة" : "It wasn't posted — retry") : t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
