
"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LinkedinIcon } from "@/components/brand-icons";
import { AiWorking, EmptyState, ErrorNote } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardTitle, PageHeader } from "@/components/ui/card";
import { Field, Segmented, Textarea } from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/overlay";
import { API_URL, api, ApiError, getApiToken } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth, useToast } from "@/lib/providers";
import type {
  Achievement,
  ClaimCheck,
  IntegrationStatus,
  Post,
} from "@/lib/types";
import { cn, isArabic, timeAgo } from "@/lib/utils";

const TONES = [
  "professional",
  "inspiring",
  "storytelling",
  "concise",
  "humble",
  "technical",
] as const;

type Tone = (typeof TONES)[number];

type PostImage = {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  url: string;
};

type StudioPost = Post & {
  images: PostImage[];
};

type EvaluationResult = {
  candidates: Achievement[];
  no_achievement_reason: string;
  injection_flags?: string[];
};

function PrivatePostImage({
  image,
}: {
  image: PostImage;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setSrc(null);

    async function loadImage() {
      try {
        const token = await getApiToken();

        if (!token || !active) return;

        const response = await fetch(
          `${API_URL}${image.url}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) return;

        const blob = await response.blob();

        if (!active) return;

        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        // Image preview unavailable.
      }
    }

    void loadImage();

    return () => {
      active = false;

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [image.url]);

  return src ? (
    <img
      src={src}
      alt={image.filename}
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="grid h-full place-items-center bg-paper-2">
      <ImagePlus className="size-6 text-ink-faint" />
    </div>
  );
}

function ClaimPanel({
  check,
}: {
  check: ClaimCheck | undefined;
}) {
  const { t } = useI18n();

  if (!check || check.claims_checked === undefined) {
    return null;
  }

  return (
    <div
      className={cn(
        "sketch-soft flex flex-col gap-2 p-3 text-sm",
        check.passed ? "bg-ok-fill" : "bg-warn-fill"
      )}
    >
      <div className="flex items-center gap-2 font-hand text-lg">
        {check.passed ? (
          <ShieldCheck className="size-5" />
        ) : (
          <AlertTriangle className="size-5" />
        )}

        {check.passed
          ? t("studio.claims.ok")
          : t("studio.claims.bad")}
      </div>

      <div className="text-xs text-ink-soft">
        {check.claims_checked} claims checked
        {check.revisions
          ? ` · auto-revised ${check.revisions}×`
          : ""}
        {check.provider
          ? ` · ${check.provider}`
          : ""}
        {check.fallback_used
          ? " (fallback)"
          : ""}
      </div>

      {!check.passed && (
        <div className="flex flex-wrap gap-1.5">
          {check.unsupported.map((u) => (
            <Badge
              key={u.type + u.value}
              tone="bad"
            >
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

  const posts = useApi<StudioPost[]>("/api/posts");

  const integrations = useApi<
    Record<string, IntegrationStatus>
  >("/api/integrations");

  const [free, setFree] = useState("");
  const [tone, setTone] = useState<Tone>("professional");
  const [lang, setLang] = useState<"en" | "ar">(locale);
  const [instructions, setInstructions] = useState("");
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [current, setCurrent] = useState<StudioPost | null>(null);
  const [content, setContent] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [improved, setImproved] = useState<{
    content: string;
    hashtags: string[];
    claim_check: ClaimCheck;
  } | null>(null);

  const [evaluated, setEvaluated] =
    useState<EvaluationResult | null>(null);

  const [evaluatedText, setEvaluatedText] = useState("");

  const [contributionNotes, setContributionNotes] = useState<
    Record<string, string>
  >({});

  const linkedin = integrations.data?.linkedin;

  const dirty =
    current && content !== current.content;

  const canGenerate =
    free.trim().length >= 20;

  const canEditCurrent =
    !!current &&
    !["published", "publishing", "uncertain"].includes(
      current.status
    );

  const steps =
    locale === "ar"
      ? ["كتابة", "فحص الادعاءات", "مراجعة"]
      : ["write", "check claims", "revise if needed"];

  const evaluationIsCurrent =
    evaluated !== null &&
    evaluatedText === free.trim();

  function load(p: StudioPost) {
    setCurrent(p);
    setContent(p.content);
    setImproved(null);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function generate() {
    if (!canGenerate || busy !== null) return;

    setBusy("generate");
    setError(null);

    try {
      const p = await api<StudioPost>(
        "/api/posts/generate",
        {
          method: "POST",
          json: {
            achievement_id: null,
            text: free,
            tone,
            language: lang,
            instructions,
          },
        }
      );

      load(p);
      posts.reload();
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function evaluateAchievement() {
    const text = free.trim();

    if (text.length < 20 || busy !== null) {
      return;
    }

    setBusy("evaluate");
    setError(null);
    setEvaluated(null);
    setEvaluatedText("");

    try {
      const result = await api<EvaluationResult>(
        "/api/achievements/extract",
        {
          method: "POST",
          json: { text },
        }
      );

      setEvaluated(result);
      setEvaluatedText(text);

      if (result.candidates.length > 0) {
        toast(
          "ok",
          locale === "ar"
            ? "تم استخراج الإنجازات. راجعيها قبل التأكيد."
            : "Achievements extracted. Review before confirming."
        );
      }
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function reviewAchievement(
    achievement: Achievement,
    action: "confirm" | "reject"
  ) {
    if (busy !== null) return;

    const contributionNote = (
      contributionNotes[achievement.id] ??
      achievement.contribution_note ??
      ""
    ).trim();

    if (
      action === "confirm" &&
      achievement.needs_contribution_confirmation &&
      contributionNote.length < 10
    ) {
      toast(
        "error",
        locale === "ar"
          ? "اكتبي وصفًا لمساهمتك الشخصية لا يقل عن 10 أحرف."
          : "Describe your personal contribution in at least 10 characters."
      );

      return;
    }

    setBusy(achievement.id);
    setError(null);

    try {
      if (action === "confirm") {
        const result = await api<{
          achievement: Achievement;
          cv_update: unknown;
        }>(
          `/api/achievements/${achievement.id}/confirm`,
          {
            method: "POST",
            json: {
              contribution_note: contributionNote,
              auto_cv_update: true,
            },
          }
        );

        toast(
          "ok",
          result.cv_update
            ? locale === "ar"
              ? "تم تأكيد الإنجاز. راجعي اقتراح تحديث السيرة الذاتية."
              : "Achievement confirmed. Review your CV suggestion."
            : locale === "ar"
              ? "تم تأكيد الإنجاز."
              : "Achievement confirmed."
        );
      } else {
        await api(
          `/api/achievements/${achievement.id}/reject`,
          {
            method: "POST",
          }
        );

        toast(
          "ok",
          locale === "ar"
            ? "تم رفض الإنجاز."
            : "Achievement rejected."
        );
      }

      setEvaluated((previous) =>
        previous
          ? {
              ...previous,
              candidates: previous.candidates.filter(
                (item) => item.id !== achievement.id
              ),
            }
          : null
      );
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function improve() {
    if (busy !== null) return;

    setBusy("improve");
    setError(null);

    try {
      setImproved(
        await api<{
          content: string;
          hashtags: string[];
          claim_check: ClaimCheck;
        }>("/api/posts/improve", {
          method: "POST",
          json: {
            content: draftText,
            tone,
            language: lang,
          },
        })
      );
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(null);
    }
  }

  async function saveEdits() {
    if (!current || !canEditCurrent || busy !== null) {
      return;
    }

    setBusy("save");

    try {
      const p = await api<StudioPost>(
        `/api/posts/${current.id}`,
        {
          method: "PATCH",
          json: { content },
        }
      );

      setCurrent(p);
      posts.reload();

      toast(
        "ok",
        locale === "ar"
          ? "تم الحفظ"
          : "Saved"
      );
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadImages(
    files: FileList | null
  ) {
    if (
      !current ||
      !canEditCurrent ||
      !files?.length ||
      busy !== null
    ) {
      return;
    }

    const selected = Array.from(files);
    const existing = current.images?.length ?? 0;

    if (existing + selected.length > 4) {
      toast(
        "error",
        locale === "ar"
          ? "الحد الأقصى 4 صور"
          : "Maximum 4 images"
      );
      return;
    }

    const invalid = selected.some(
      (file) =>
        !["image/jpeg", "image/png"].includes(file.type) ||
        file.size === 0 ||
        file.size > 5 * 1024 * 1024
    );

    if (invalid) {
      toast(
        "error",
        locale === "ar"
          ? "اختاري صور JPG أو PNG بحجم 5MB أو أقل"
          : "Choose JPG or PNG images up to 5MB"
      );
      return;
    }

    const form = new FormData();

    selected.forEach((file) => {
      form.append("files", file);
    });

    setBusy("images");

    try {
      const updated = await api<StudioPost>(
        `/api/posts/${current.id}/images`,
        {
          method: "POST",
          body: form,
        }
      );

      setCurrent(updated);
      posts.reload();

      toast(
        "ok",
        locale === "ar"
          ? "تم رفع الصور"
          : "Images uploaded"
      );
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function deleteImage(
    imageId: string
  ) {
    if (
      !current ||
      !canEditCurrent ||
      busy !== null
    ) {
      return;
    }

    setBusy("images");

    try {
      await api(
        `/api/posts/${current.id}/images/${imageId}`,
        {
          method: "DELETE",
        }
      );

      const updated = await api<StudioPost[]>(
        "/api/posts"
      );

      const refreshed = updated.find(
        (p) => p.id === current.id
      );

      if (refreshed) {
        setCurrent(refreshed);
      }

      posts.reload();

      toast(
        "ok",
        locale === "ar"
          ? "تم حذف الصورة"
          : "Image removed"
      );
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function publish(
    confirmNotPublished = false
  ) {
    if (!current || busy !== null) return;

    setBusy("publish");

    try {
      if (dirty) {
        await api<StudioPost>(
          `/api/posts/${current.id}`,
          {
            method: "PATCH",
            json: { content },
          }
        );
      }

      const p = await api<StudioPost>(
        `/api/posts/${current.id}/publish`,
        {
          method: "POST",
          json: {
            confirm: true,
            confirm_not_published:
              confirmNotPublished,
          },
        }
      );

      setCurrent(p);

      toast(
        "ok",
        locale === "ar"
          ? "تم النشر على LinkedIn ✓"
          : "Published on LinkedIn ✓"
      );
    } catch (e) {
      const err = e as ApiError;

      toast("error", err.message);

      const detail = err.detail as
        | { post?: StudioPost }
        | undefined;

      if (detail?.post) {
        setCurrent(detail.post);
      }
    } finally {
      setBusy(null);
      setConfirmOpen(false);
      posts.reload();
    }
  }

  async function remove(p: StudioPost) {
    if (busy !== null) return;

    try {
      await api(
        `/api/posts/${p.id}`,
        {
          method: "DELETE",
        }
      );

      if (current?.id === p.id) {
        setCurrent(null);
        setContent("");
      }

      posts.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("studio.title")}
        sub={t("studio.sub")}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Composer */}
        <Card>
          <Tabs defaultValue="generate">
            <TabsList>
              <TabsTrigger value="generate">
                <Sparkles className="me-1 inline size-4" />
                {t("studio.generate")}
              </TabsTrigger>

              <TabsTrigger value="improve">
                <Wand2 className="me-1 inline size-4" />
                {t("studio.improve")}
              </TabsTrigger>
            </TabsList>

            <div className="flex flex-col gap-5">
              <TabsContent
                value="generate"
                className="flex flex-col gap-5"
              >
                <Field
                  label={
                    locale === "ar"
                      ? "عن وش ودك تنشرين؟"
                      : "What would you like to post about?"
                  }
                >
                  <Textarea
                    value={free}
                    onChange={(e) =>
                      setFree(e.target.value)
                    }
                    className="min-h-28"
                    maxLength={4000}
                    dir="auto"
                    placeholder={
                      locale === "ar"
                        ? "شاركي إنجازًا، شهادة جديدة، فكرة، أو شيئًا تعلمتيه..."
                        : "Share an achievement, a new certification, an idea, or something you've learned..."
                    }
                  />
                </Field>

                <Field
                  label={t("studio.instructions")}
                >
                  <Textarea
                    value={instructions}
                    onChange={(e) =>
                      setInstructions(e.target.value)
                    }
                    className="min-h-16"
                    maxLength={500}
                  />
                </Field>
              </TabsContent>

              <TabsContent
                value="improve"
                className="flex flex-col gap-5"
              >
                <Field
                  label={
                    locale === "ar"
                      ? "مسودتك"
                      : "Your draft"
                  }
                >
                  <Textarea
                    value={draftText}
                    onChange={(e) =>
                      setDraftText(e.target.value)
                    }
                    className="min-h-40"
                    maxLength={3000}
                    dir="auto"
                  />
                </Field>
              </TabsContent>

              <Field
                group
                label={t("studio.tone")}
              >
                <Segmented
                  ariaLabel={t("studio.tone")}
                  value={tone}
                  onChange={setTone}
                  options={TONES.map((x) => ({
                    value: x,
                    label: t(
                      `tone.${x}` as TKey
                    ),
                  }))}
                />
              </Field>

              <Field
                group
                label={t("studio.language")}
              >
                <Segmented
                  ariaLabel={t("studio.language")}
                  value={lang}
                  onChange={setLang}
                  options={[
                    {
                      value: "en",
                      label: "English",
                    },
                    {
                      value: "ar",
                      label: "العربية",
                    },
                  ]}
                />
              </Field>

              <ErrorNote error={error} />

              {(busy === "generate" ||
                busy === "improve" ||
                busy === "evaluate") && (
                <AiWorking
                  steps={
                    busy === "evaluate"
                      ? locale === "ar"
                        ? [
                            "تحليل الوصف",
                            "استخراج الإنجازات",
                            "تجهيز المراجعة",
                          ]
                        : [
                            "analyze",
                            "extract achievements",
                            "prepare review",
                          ]
                      : steps
                  }
                />
              )}

              <TabsContent value="generate">
                <div className="flex flex-col gap-3">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={generate}
                    loading={
                      busy === "generate"
                    }
                    disabled={
                      !canGenerate ||
                      busy !== null
                    }
                  >
                    <Sparkles />
                    {t("studio.generate")}
                  </Button>

                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={evaluateAchievement}
                    loading={
                      busy === "evaluate"
                    }
                    disabled={
                      free.trim().length < 20 ||
                      busy !== null ||
                      evaluationIsCurrent
                    }
                  >
                    <Sparkles />
                    Evaluate for CV
                  </Button>

                  {evaluationIsCurrent &&
                    evaluated && (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-ink-soft">
                          {locale === "ar"
                            ? "سيتم حفظ الإنجازات المكتشفة كاقتراحات بانتظار تأكيدك."
                            : "Detected achievements are saved as pending until you confirm them."}
                        </p>

                        {evaluated.candidates.length === 0 ? (
                          <div className="sketch-soft p-3 text-sm">
                            {evaluated.no_achievement_reason ||
                              (locale === "ar"
                                ? "لا توجد إنجازات جديدة بانتظار المراجعة."
                                : "No new achievements to review.")}
                          </div>
                        ) : (
                          evaluated.candidates.map(
                            (achievement) => (
                              <div
                                key={
                                  achievement.id
                                }
                                className="sketch-soft flex flex-col gap-3 p-4"
                              >
                                <div>
                                  <p className="font-bold">
                                    {
                                      achievement.title
                                    }
                                  </p>

                                  <p
                                    className="mt-2 text-sm"
                                    dir="auto"
                                  >
                                    {
                                      achievement.description
                                    }
                                  </p>

                                  <p className="mt-2 text-xs text-ink-soft">
                                    {
                                      achievement.category
                                    }
                                  </p>

                                  {achievement.duplicate_of && (
                                    <p className="mt-2 text-sm text-ink-soft">
                                      {locale === "ar"
                                        ? "قد يكون إنجازًا مكررًا: "
                                        : "Possible duplicate: "}
                                      {
                                        achievement.duplicate_of.title
                                      }
                                    </p>
                                  )}
                                </div>

                                {achievement.needs_contribution_confirmation && (
                                  <Field
                                    label={
                                      locale === "ar"
                                        ? "وش كانت مساهمتك الشخصية في الإنجاز؟"
                                        : "What was your personal contribution?"
                                    }
                                  >
                                    <Textarea
                                      value={
                                        contributionNotes[
                                          achievement.id
                                        ] ??
                                        achievement.contribution_note ??
                                        ""
                                      }
                                      onChange={(
                                        e
                                      ) =>
                                        setContributionNotes(
                                          (
                                            previous
                                          ) => ({
                                            ...previous,
                                            [achievement.id]:
                                              e
                                                .target
                                                .value,
                                          })
                                        )
                                      }
                                      maxLength={
                                        1500
                                      }
                                      placeholder={
                                        locale === "ar"
                                          ? "اشرحي دورك الفعلي في المشروع أو الإنجاز…"
                                          : "Describe your actual role…"
                                      }
                                    />
                                  </Field>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      reviewAchievement(
                                        achievement,
                                        "confirm"
                                      )
                                    }
                                    loading={
                                      busy ===
                                      achievement.id
                                    }
                                    disabled={
                                      busy !==
                                      null
                                    }
                                  >
                                    <Check />
                                    {locale === "ar"
                                      ? "تأكيد الإنجاز"
                                      : "Confirm"}
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      reviewAchievement(
                                        achievement,
                                        "reject"
                                      )
                                    }
                                    disabled={
                                      busy !==
                                      null
                                    }
                                  >
                                    <Trash2 />
                                    {locale === "ar"
                                      ? "رفض"
                                      : "Reject"}
                                  </Button>
                                </div>
                              </div>
                            )
                          )
                        )}

                        <Link
                          href="/achievements"
                          className="text-sm font-bold underline"
                        >
                          {locale === "ar"
                            ? "عرض جميع الإنجازات"
                            : "View all achievements"}
                        </Link>
                      </div>
                    )}
                </div>
              </TabsContent>

              <TabsContent
                value="improve"
                className="flex flex-col gap-4"
              >
                <Button
                  className="w-full"
                  size="lg"
                  onClick={improve}
                  loading={
                    busy === "improve"
                  }
                  disabled={
                    draftText.trim().length < 20 ||
                    busy !== null
                  }
                >
                  <Wand2 />
                  {t("studio.improve")}
                </Button>

                {improved && (
                  <div className="flex flex-col gap-3">
                    <div
                      className="sketch-soft whitespace-pre-wrap bg-paper-2 p-4 text-sm"
                      dir="auto"
                    >
                      {improved.content}

                      <div className="mt-2 text-brand">
                        {improved.hashtags.join(
                          " "
                        )}
                      </div>
                    </div>

                    <ClaimPanel
                      check={
                        improved.claim_check
                      }
                    />

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          improved.content +
                            "\n\n" +
                            improved.hashtags.join(
                              " "
                            )
                        );

                        toast(
                          "ok",
                          t("common.copied")
                        );
                      }}
                    >
                      <Copy />
                      {t("common.copy")}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </Card>

        {/* LinkedIn Preview */}
        <Card
          tone="tint"
          className="flex flex-col gap-4"
        >
          <CardTitle
            icon={<LinkedinIcon />}
          >
            {t("studio.preview")}
          </CardTitle>

          {!current ? (
            <EmptyState
              title={t("studio.empty")}
            />
          ) : (
            <>
              <div className="sketch bg-paper p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="grid size-11 place-items-center rounded-full border-2 border-ink bg-sky font-hand text-lg">
                    {(
                      user?.full_name ||
                      user?.email ||
                      "?"
                    )[0].toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <div className="font-bold">
                      {user?.full_name ||
                        user?.email}
                    </div>

                    <div className="truncate text-xs text-ink-faint">
                      {user?.headline ||
                        "LinkedIn member"}{" "}
                      · 🌐
                    </div>
                  </div>

                  <Badge
                    className="ms-auto"
                    tone={
                      current.status ===
                      "published"
                        ? "ok"
                        : current.status ===
                            "failed" ||
                          current.status ===
                            "uncertain"
                          ? "bad"
                          : "neutral"
                    }
                  >
                    {t(
                      `post.status.${current.status}` as TKey
                    )}
                  </Badge>
                </div>

                <Textarea
                  aria-label="Post content"
                  value={content}
                  onChange={(e) =>
                    setContent(e.target.value)
                  }
                  disabled={!canEditCurrent}
                  dir={
                    isArabic(content)
                      ? "rtl"
                      : "ltr"
                  }
                  className="min-h-64 border-dashed bg-paper"
                  maxLength={3000}
                />

                <div className="mt-2 flex flex-wrap gap-1.5 text-sm text-brand">
                  {current.hashtags.join(
                    " "
                  )}
                </div>

                <div className="mt-1 text-end text-xs text-ink-faint">
                  {content.length} / 3000
                </div>
              </div>

              {/* Image upload */}
              <div className="sketch-soft flex flex-col gap-3 bg-paper p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-bold">
                    <ImagePlus className="size-5" />
                    {locale === "ar"
                      ? "صور المنشور"
                      : "Post images"}
                  </div>

                  <span className="text-xs text-ink-soft">
                    {current.images?.length ??
                      0}{" "}
                    / 4
                  </span>
                </div>

                {(current.images?.length ??
                  0) > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {current.images.map(
                      (image) => (
                        <div
                          key={image.id}
                          className="relative aspect-square overflow-hidden rounded-xl border-2 border-ink bg-paper-2"
                        >
                          <PrivatePostImage
                            image={image}
                          />

                          {canEditCurrent && (
                            <button
                              type="button"
                              aria-label={
                                locale ===
                                "ar"
                                  ? "حذف الصورة"
                                  : "Remove image"
                              }
                              disabled={
                                busy !==
                                null
                              }
                              onClick={() =>
                                deleteImage(
                                  image.id
                                )
                              }
                              className="absolute right-2 top-2 grid size-8 place-items-center rounded-full border-2 border-ink bg-paper shadow-sm disabled:opacity-50"
                            >
                              <X className="size-4" />
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                )}

                {canEditCurrent &&
                  (current.images?.length ??
                    0) < 4 && (
                    <label
                      className={cn(
                        "sketch-dashed flex flex-col items-center justify-center gap-2 p-6 text-center",
                        busy === null
                          ? "cursor-pointer hover:bg-paper-2"
                          : "cursor-not-allowed opacity-60"
                      )}
                    >
                      <ImagePlus className="size-7 text-brand" />

                      <span className="text-sm font-bold">
                        {busy === "images"
                          ? locale === "ar"
                            ? "جاري رفع الصور..."
                            : "Uploading images..."
                          : locale === "ar"
                            ? "اضغطي لإضافة صور"
                            : "Click to add images"}
                      </span>

                      <span className="text-xs text-ink-soft">
                        JPG, PNG · Max 4
                        images · 5MB each
                      </span>

                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        multiple
                        className="hidden"
                        disabled={
                          busy !== null
                        }
                        onChange={(e) => {
                          void uploadImages(
                            e.target.files
                          );
                          e.target.value =
                            "";
                        }}
                      />
                    </label>
                  )}
              </div>

              <ClaimPanel
                check={
                  current.claim_check
                }
              />

              {current.publish_error && (
                <div
                  className="sketch-soft bg-bad-fill p-3 text-sm"
                  role="alert"
                >
                  {
                    current.publish_error
                  }
                </div>
              )}

              {current.status ===
                "published" &&
                current.linkedin_post_urn && (
                  <a
                    className="inline-flex items-center gap-2 text-sm font-bold underline"
                    href={`https://www.linkedin.com/feed/update/${current.linkedin_post_urn}/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    {
                      current.linkedin_post_urn
                    }
                  </a>
                )}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveEdits}
                  loading={
                    busy === "save"
                  }
                  disabled={
                    !dirty ||
                    !canEditCurrent ||
                    busy !== null
                  }
                >
                  <Save />
                  {t("common.save")}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      content +
                        "\n\n" +
                        current.hashtags.join(
                          " "
                        )
                    );

                    toast(
                      "ok",
                      t("common.copied")
                    );
                  }}
                >
                  <Copy />
                  {t("common.copy")}
                </Button>

                {current.status !==
                  "published" && (
                  <Button
                    size="sm"
                    className="ms-auto"
                    disabled={
                      !linkedin?.connected ||
                      busy !== null ||
                      current.status ===
                        "publishing"
                    }
                    onClick={() =>
                      setConfirmOpen(true)
                    }
                  >
                    <Send className="rtl:-scale-x-100" />
                    {t("studio.publish")}
                  </Button>
                )}
              </div>

              {!linkedin?.connected && (
                <p className="sketch-dashed flex items-center gap-2 p-3 text-sm text-ink-soft">
                  <LinkedinIcon className="size-5 shrink-0" />

                  {linkedin?.configured_on_server ===
                  false
                    ? t(
                        "studio.linkedin.unconfigured"
                      )
                    : t(
                        "studio.linkedin.off"
                      )}

                  <Link
                    href="/settings"
                    className="ms-auto font-bold underline"
                  >
                    {t("nav.settings")}
                  </Link>
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Saved drafts */}
      <h2 className="mt-12 mb-4 font-hand text-3xl">
        {t("studio.drafts")}
      </h2>

      {posts.data?.length === 0 && (
        <p className="text-sm text-ink-soft">
          {t("common.none")}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {posts.data?.map((p) => (
          <div
            key={p.id}
            className={cn(
              "sketch flex flex-col gap-3 p-4",
              current?.id === p.id &&
                "!bg-sky"
            )}
          >
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  p.status ===
                  "published"
                    ? "ok"
                    : p.status ===
                        "draft"
                      ? "neutral"
                      : "bad"
                }
              >
                {t(
                  `post.status.${p.status}` as TKey
                )}
              </Badge>

              <Badge>
                {t(
                  `tone.${p.tone}` as TKey
                )}
              </Badge>

              {p.claim_check?.passed ? (
                <Check
                  className="size-4 text-ok"
                  aria-label="claims ok"
                />
              ) : (
                <AlertTriangle
                  className="size-4 text-warn"
                  aria-label="unsupported claims"
                />
              )}

              <span className="ms-auto text-xs text-ink-faint">
                {timeAgo(p.updated_at)}
              </span>
            </div>

            <p
              className="line-clamp-4 text-sm"
              dir="auto"
            >
              {p.content}
            </p>

            {(p.images?.length ??
              0) > 0 && (
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <ImagePlus className="size-4" />
                {p.images.length}{" "}
                {locale === "ar"
                  ? "صور"
                  : "images"}
              </div>
            )}

            <div className="mt-auto flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => load(p)}
              >
                {t("common.edit")}
              </Button>

              {p.status !==
                "published" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    remove(p)
                  }
                  aria-label={t(
                    "common.delete"
                  )}
                  disabled={
                    busy !== null
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Publish confirmation */}
      <Dialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
      >
        <DialogContent
          title={t("studio.publish")}
          description={t(
            "studio.publish.confirm"
          )}
        >
          <div
            className="sketch-soft mb-4 max-h-60 overflow-y-auto whitespace-pre-wrap bg-paper-2 p-3 text-sm"
            dir="auto"
          >
            {content}
          </div>

          {(current?.images?.length ??
            0) > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-sm font-bold">
                {locale === "ar"
                  ? "الصور المرفقة"
                  : "Attached images"}
              </p>

              <div className="grid grid-cols-4 gap-2">
                {current?.images.map(
                  (image) => (
                    <div
                      key={image.id}
                      className="aspect-square overflow-hidden rounded-lg border-2 border-ink bg-paper-2"
                    >
                      <PrivatePostImage
                        image={image}
                      />
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {current?.claim_check &&
            !current.claim_check.passed && (
              <div className="mb-4">
                <ClaimPanel
                  check={
                    current.claim_check
                  }
                />
              </div>
            )}

          {current?.status ===
            "uncertain" && (
            <p className="mb-4 rounded-lg bg-warn-fill p-3 text-sm">
              {locale === "ar"
                ? "المحاولة السابقة ربما نجحت. تأكدي من حسابك على LinkedIn قبل إعادة النشر لتجنب التكرار."
                : "The previous attempt may have succeeded. Check your LinkedIn profile first to avoid a duplicate post."}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setConfirmOpen(false)
              }
            >
              {t("common.cancel")}
            </Button>

            <Button
              onClick={() =>
                publish(
                  current?.status ===
                    "uncertain"
                )
              }
              loading={
                busy === "publish"
              }
              disabled={
                busy !== null
              }
            >
              <Send className="rtl:-scale-x-100" />

              {current?.status ===
              "uncertain"
                ? locale === "ar"
                  ? "لم يُنشر — أعد المحاولة"
                  : "It wasn't posted — retry"
                : t("common.confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
