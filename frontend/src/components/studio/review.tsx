"use client";

/*
 * Evidence review for a LinkedIn draft: a writing assistant that explains each claim, links it to the sentence in
 * the editor, proposes safer wording and re-checks edits with the same verifier used at publish time.
 *
 * Ground rules (kept in code, not only in copy):
 *  - nothing in the post changes unless the user clicks Apply / Use this wording / Remove;
 *  - "Keep it as written" never changes a claim's status (it only collapses the card);
 *  - evidence shown is the real evidence the verifier used; nothing is added to it.
 */

import { Check, ChevronDown, CircleCheck, CircleHelp, CircleSlash, Eye, Lightbulb, Pencil, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { claimReasonText, type ClaimReport, type VerifiedClaim } from "@/components/claims";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { asReport, fill, type StudioPost } from "./model";
import {
  adviceKey,
  breakdown,
  claimAt,
  claimKey,
  removeRange,
  type Located,
  locateClaim,
  reviewStatus,
  type ReviewStatus,
  suggest,
} from "./review-model";

/* ------------------------------------------------------------------ live re-check */

export type ReviewState = "saved" | "live" | "checking" | "pending" | "stale" | "error" | "need-description" | "none";

const DESC_KEY = "wasl.studio.descriptions";

function readDescriptions(): Record<string, string> {
  try {
    return JSON.parse(sessionStorage.getItem(DESC_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/**
 * Keeps the report in step with the editor: the saved report while the text matches what was saved, and a
 * read-only server re-check (debounced) once the user edits. Descriptions used for description-based posts live
 * in sessionStorage only (they are the user's own text and are never stored on the server).
 */
export function useClaimReview(current: StudioPost | null, content: string, editable: boolean) {
  const [live, setLive] = useState<{ postId: string; content: string; report: ClaimReport } | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [needDescription, setNeedDescription] = useState(false);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});

  // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate the tab-local descriptions after mount
  useEffect(() => setDescriptions(readDescriptions()), []);

  const rememberDescription = useCallback((postId: string, text: string) => {
    setDescriptions((prev) => {
      const next = { ...prev, [postId]: text };
      try {
        sessionStorage.setItem(DESC_KEY, JSON.stringify(next));
      } catch {
        // storage unavailable: the description simply isn't remembered for this tab
      }
      return next;
    });
  }, []);

  const forgetDescription = useCallback((postId: string) => {
    setDescriptions((prev) => {
      const next = { ...prev };
      delete next[postId];
      try {
        sessionStorage.setItem(DESC_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const postId = current?.id ?? null;
  const description = postId ? descriptions[postId] : undefined;
  const fromDescription = !!current && !current.achievement_id;

  const runCheck = useCallback(
    async (text: string, descOverride?: string) => {
      if (!current) return;
      const evidence = fromDescription ? (descOverride ?? descriptions[current.id]) : undefined;
      if (fromDescription && !evidence) {
        setNeedDescription(true);
        return;
      }
      setChecking(true);
      setFailed(false);
      try {
        const r = await api<{ claim_check: ClaimReport }>(`/api/posts/${current.id}/check`, {
          method: "POST",
          json: { content: text, ...(evidence ? { evidence_text: evidence } : {}) },
        });
        setLive({ postId: current.id, content: text, report: r.claim_check });
        setNeedDescription(false);
      } catch (e) {
        const detail = (e as ApiError).detail as { code?: string } | undefined;
        if (detail?.code === "evidence_not_stored") setNeedDescription(true);
        else setFailed(true);
      } finally {
        setChecking(false);
      }
    },
    [current, descriptions, fromDescription],
  );

  const saved = asReport(current?.claim_check);
  const stale = !!(current?.claim_check as { stale?: boolean } | undefined)?.stale;
  const dirty = !!current && content !== current.content;
  // once the text matches what is saved, the saved report (re-checked by the server on save) is the truth
  const liveIsCurrent = dirty && !!live && live.postId === postId && live.content === content;

  // re-check edits after a short pause in typing
  useEffect(() => {
    if (!current || !editable || !dirty || liveIsCurrent || checking) return;
    if (fromDescription && !description) return;
    const h = window.setTimeout(() => void runCheck(content), 900);
    return () => window.clearTimeout(h);
  }, [current, editable, dirty, liveIsCurrent, checking, content, fromDescription, description, runCheck]);

  // a different post was opened: forget the previous live check
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset per-post review state
    setNeedDescription(false);
    setFailed(false);
  }, [postId]);

  const report = liveIsCurrent ? live!.report : dirty && live?.postId === postId ? live!.report : saved;
  let state: ReviewState = "saved";
  if (!report) state = "none";
  if (checking) state = "checking";
  else if (liveIsCurrent) state = "live";
  else if (dirty && fromDescription && !description) state = "need-description";
  else if (dirty) state = "pending";
  else if (stale) state = "stale";
  if (!checking && failed) state = "error";
  if (needDescription && !checking && !liveIsCurrent) state = "need-description";

  return {
    report,
    state,
    recheck: () => void runCheck(content),
    /** Re-check a specific text right away (after an explicit edit from the review). */
    checkNow: (text: string) => void runCheck(text),
    provideDescription: (text: string) => {
      if (!current) return;
      rememberDescription(current.id, text);
      void runCheck(content, text);
    },
    description,
    rememberDescription,
    forgetDescription,
  };
}

/* ------------------------------------------------------------------ status presentation */

const STATUS_UI: Record<ReviewStatus, { icon: React.ElementType; fg: string; soft: string; bar: string; rail: string }> = {
  supported: { icon: CircleCheck, fg: "text-ok", soft: "bg-ok-soft", bar: "bg-ok/85", rail: "border-s-ok/50" },
  review: { icon: CircleHelp, fg: "text-warn", soft: "bg-warn-soft", bar: "bg-warn/80", rail: "border-s-warn/50" },
  unsupported: { icon: CircleSlash, fg: "text-bad", soft: "bg-bad-soft", bar: "bg-bad/55", rail: "border-s-bad/35" },
};

/* ------------------------------------------------------------------ editor with sentence highlights */

export type Mark = Located & { key: string; status: ReviewStatus };

export function claimMarks(content: string, report: ClaimReport | null): Mark[] {
  const out: Mark[] = [];
  for (const c of report?.claims ?? []) {
    const status = reviewStatus(c.status);
    if (status === "supported") continue;
    const loc = locateClaim(content, c);
    if (loc) out.push({ ...loc, key: claimKey(c), status });
  }
  return out;
}

/**
 * A textarea with a highlight layer behind it (same metrics, transparent text): flagged sentences are underlined,
 * the active one is tinted. The textarea grows with its content so the two layers never scroll apart.
 */
export function HighlightTextarea({
  id,
  value,
  onChange,
  marks,
  activeKey,
  scrollSignal,
  onCaret,
  disabled,
  dir,
  maxLength,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  marks: Mark[];
  activeKey: string | null;
  scrollSignal: number;
  onCaret: (pos: number) => void;
  disabled?: boolean;
  dir: "ltr" | "rtl";
  maxLength: number;
  describedBy?: string;
}) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight + 2, 256)}px`;
  }, [value]);

  useEffect(() => {
    if (!scrollSignal) return;
    layer.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollSignal]);

  // Paint per character, then group into runs (marks may overlap when two claims share a sentence).
  const segments = useMemo(() => {
    const n = value.length;
    const level = new Uint8Array(n); // 0 none, 1 review, 2 unsupported
    const active = new Uint8Array(n); // 1 sentence, 2 phrase
    for (const m of marks) {
      const lv = m.status === "unsupported" ? 2 : 1;
      for (let i = m.start; i < m.end && i < n; i++) level[i] = Math.max(level[i], lv);
      if (m.key === activeKey) {
        for (let i = m.start; i < m.end && i < n; i++) active[i] = Math.max(active[i], 1);
        for (let i = m.phraseStart; i < m.phraseEnd && i < n; i++) active[i] = 2;
      }
    }
    const runs: { text: string; level: number; active: number }[] = [];
    for (let i = 0; i < n; i++) {
      const last = runs[runs.length - 1];
      if (last && last.level === level[i] && last.active === active[i]) last.text += value[i];
      else runs.push({ text: value[i], level: level[i], active: active[i] });
    }
    return runs;
  }, [value, marks, activeKey]);

  const metrics = "px-3 py-2 text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:break-word]";

  return (
    <div className="relative rounded-md bg-bg">
      <div ref={layer} aria-hidden dir={dir} className={cn("pointer-events-none absolute inset-0 overflow-hidden border border-transparent text-transparent", metrics)}>
        {segments.map((s, i) =>
          s.level === 0 && s.active === 0 ? (
            <span key={i}>{s.text}</span>
          ) : (
            <span
              key={i}
              data-active={s.active ? "true" : undefined}
              className={cn(
                "rounded-[3px] underline decoration-2 underline-offset-[5px]",
                s.level === 2 ? "decoration-bad/45" : s.level === 1 ? "decoration-warn/80" : "decoration-transparent",
                s.active === 1 && "bg-highlight/70",
                s.active === 2 && (s.level === 2 ? "bg-bad-soft" : "bg-warn-soft"),
              )}
            >
              {s.text}
            </span>
          ),
        )}
        {value.endsWith("\n") && "​"}
      </div>
      <Textarea
        ref={ta}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => onCaret(e.currentTarget.selectionStart)}
        onKeyUp={(e) => onCaret(e.currentTarget.selectionStart)}
        disabled={disabled}
        dir={dir}
        maxLength={maxLength}
        aria-describedby={describedBy}
        className={cn("relative min-h-64 resize-none overflow-hidden border-dashed bg-transparent", metrics)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ the review panel */

export type EvidenceInfo = { source: "achievement" | "description"; title?: string; lines: string[] } | null;

export type ReviewProps = {
  report: ClaimReport | null;
  state: ReviewState;
  content: string;
  editable: boolean;
  activeKey: string | null;
  onActivate: (key: string | null, scroll: boolean) => void;
  onRecheck: () => void;
  onReplace: (start: number, end: number, text: string) => void;
  onProvideDescription: (text: string) => void;
  evidence: EvidenceInfo;
};

/** A quoted phrase with the reader's quotation marks: “…” in English, «…» in Arabic. */
function Quoted({ text }: { text: string }) {
  const { locale } = useI18n();
  return locale === "ar" ? (
    <>
      «<bdi>{text}</bdi>»
    </>
  ) : (
    <>
      “<bdi>{text}</bdi>”
    </>
  );
}

function StateChip({ state }: { state: ReviewState }) {
  const { t } = useI18n();
  const map: Partial<Record<ReviewState, TKey>> = {
    saved: "studio2.rv.state.saved",
    live: "studio2.rv.state.live",
    checking: "studio2.rv.state.checking",
    pending: "studio2.rv.state.pending",
  };
  const k = map[state];
  if (!k) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-3" role="status">
      {state === "checking" ? <RefreshCw className="size-3 animate-spin" aria-hidden /> : <Check className="size-3" aria-hidden />}
      {t(k)}
    </span>
  );
}

function Summary({ report }: { report: ClaimReport }) {
  const { t } = useI18n();
  const b = breakdown(report);
  const flagged = b.review + b.unsupported;
  const order: ReviewStatus[] = ["supported", "review", "unsupported"];
  const headline =
    b.total === 0 ? t("studio2.rv.headline.none") : flagged === 0 ? t("studio2.rv.headline.ok") : fill(t("studio2.rv.headline.flagged"), { n: flagged, total: b.total });
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <p className="text-sm font-bold text-fg">{headline}</p>
      {b.total > 0 && (
        <>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={order.map((s) => `${t(`studio2.rv.${s}` as TKey)} ${b[s]}`).join(", ")}>
            {order.map((s) => (b[s] ? <span key={s} className={cn("h-full", STATUS_UI[s].bar)} style={{ width: `${(b[s] / b.total) * 100}%` }} /> : null))}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {order.map((s) => {
              const Icon = STATUS_UI[s].icon;
              return (
                <div key={s} className="min-w-0">
                  <dt className={cn("flex items-center gap-1.5 text-xs font-bold", STATUS_UI[s].fg)}>
                    <Icon className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{t(`studio2.rv.${s}` as TKey)}</span>
                  </dt>
                  <dd className="num mt-0.5 text-lg leading-none font-extrabold text-fg">{b[s]}</dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </div>
  );
}

function SentenceQuote({ content, loc }: { content: string; loc: Located }) {
  const before = content.slice(loc.start, loc.phraseStart);
  const phrase = content.slice(loc.phraseStart, loc.phraseEnd);
  const after = content.slice(loc.phraseEnd, loc.end);
  return (
    <blockquote className="rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-fg" dir="auto">
      {before}
      <mark className="rounded bg-highlight px-0.5 text-fg">{phrase}</mark>
      {after}
    </blockquote>
  );
}

function ClaimCard({
  claim,
  props,
  open,
  onToggle,
  kept,
  onKeep,
}: {
  claim: VerifiedClaim;
  props: ReviewProps;
  open: boolean;
  onToggle: () => void;
  kept: boolean;
  onKeep: (v: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const uid = useId();
  const status = reviewStatus(claim.status);
  const ui = STATUS_UI[status];
  const Icon = ui.icon;
  const loc = locateClaim(props.content, claim);
  const sentence = loc ? props.content.slice(loc.start, loc.end) : "";
  const suggestion = loc ? suggest(sentence, claim) : null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(sentence);
  const value = claim.value || claim.text;
  const statusLabel = t(`studio2.rv.${status}` as TKey);
  const advice = t(`studio2.rv.fix.${adviceKey(claim)}` as TKey);

  return (
    <li className={cn("overflow-hidden rounded-xl border border-border border-s-[3px] bg-surface", ui.rail, open && "shadow-sm")}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${uid}-body`}
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-2/60"
      >
        <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-full", ui.soft, ui.fg)} aria-hidden>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold text-fg">
              <Quoted text={value} />
            </span>
            <span className={cn("text-xs font-semibold", ui.fg)}>{statusLabel}</span>
          </span>
          <span className="mt-0.5 line-clamp-1 block text-xs text-fg-2">
            {kept ? t("studio2.rv.kept.short") : claimReasonText(claim.reasons[0] || "", locale)}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-fg-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div id={`${uid}-body`} className="flex flex-col gap-4 border-t border-border-soft px-4 pt-3.5 pb-4">
          {kept ? (
            <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-sm text-fg-2">
              <p>{fill(t("studio2.rv.kept"), { status: statusLabel })}</p>
              <button type="button" onClick={() => onKeep(false)} className="mt-1.5 text-sm font-semibold text-primary-text hover:underline">
                {t("studio2.rv.kept.undo")}
              </button>
            </div>
          ) : null}

          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h4 className="text-xs font-bold tracking-wide text-fg-3 uppercase">{t("studio2.rv.in_post")}</h4>
              {loc && (
                <button type="button" onClick={() => props.onActivate(claimKey(claim), true)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-text hover:underline">
                  <Eye className="size-3.5" aria-hidden />
                  {t("studio2.rv.show_in_post")}
                </button>
              )}
            </div>
            {loc ? <SentenceQuote content={props.content} loc={loc} /> : <p className="text-sm text-fg-3">{t("studio2.rv.moved")}</p>}
          </section>

          <section>
            <h4 className="mb-1 text-xs font-bold tracking-wide text-fg-3 uppercase">{t("studio2.rv.why")}</h4>
            {claim.reasons.map((r) => (
              <p key={r} className="text-sm text-fg">
                {claimReasonText(r, locale)}
              </p>
            ))}
            <p className="mt-1 text-xs text-fg-3">{status === "unsupported" ? t("studio2.rv.risk.unsupported") : t("studio2.rv.risk.review")}</p>
          </section>

          <section>
            <h4 className="mb-1 text-xs font-bold tracking-wide text-fg-3 uppercase">{t("studio2.rv.checked")}</h4>
            {props.evidence ? (
              <>
                <p className="text-sm text-fg-2">
                  {props.evidence.source === "achievement" ? t("studio2.rv.src.achievement") : t("studio2.rv.src.description")}
                  {props.evidence.title && (
                    <>
                      : <bdi className="font-semibold text-fg">{props.evidence.title}</bdi>
                    </>
                  )}
                </p>
                {claim.evidence.length > 0 ? (
                  <div className="mt-1.5">
                    <p className="text-xs text-fg-3">{t("studio2.rv.closest")}</p>
                    {claim.evidence.slice(0, 2).map((e, i) => (
                      <blockquote key={i} className="mt-1 border-s-2 border-border-strong ps-2.5 text-sm text-fg-2" dir="auto">
                        {e.quote}
                      </blockquote>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-fg-2">{fill(t("studio2.rv.nomatch"), { v: value })}</p>
                )}
                {props.evidence.lines.length > 0 && (
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer text-xs font-semibold text-primary-text">{t("studio2.rv.show_evidence")}</summary>
                    <div className="mt-2 flex flex-col gap-1 rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-fg-2" dir="auto">
                      {props.evidence.lines.map((l, i) => (
                        <p key={i}>{l}</p>
                      ))}
                    </div>
                  </details>
                )}
              </>
            ) : (
              <p className="text-sm text-fg-3">{t("studio2.rv.evidence_missing")}</p>
            )}
          </section>

          <section className="rounded-lg border border-primary/20 bg-primary-soft/40 px-3 py-3">
            <h4 className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-primary-text uppercase">
              <Lightbulb className="size-3.5" aria-hidden />
              {t("studio2.rv.suggest")}
            </h4>
            <p className="mt-1 text-sm text-fg-2">{advice}</p>
            {props.editable && loc && suggestion?.type === "rewrite" && (
              <>
                <p className="mt-2 rounded-md border border-dashed border-primary/40 bg-surface px-3 py-2 text-sm text-fg" dir="auto">
                  {suggestion.text}
                </p>
                <Button size="sm" className="mt-2" onClick={() => props.onReplace(loc.start, loc.end, suggestion.text)}>
                  <Check />
                  {t("studio2.rv.suggest.use")}
                </Button>
              </>
            )}
            {props.editable && loc && suggestion?.type === "remove" && (
              <>
                <p className="mt-2 text-xs text-fg-3">{t("studio2.rv.suggest.remove.d")}</p>
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => props.onReplace(loc.start, loc.end, "")}>
                  <Trash2 />
                  {t("studio2.rv.suggest.remove")}
                </Button>
              </>
            )}
          </section>

          {props.editable && loc && (
            <section>
              {editing ? (
                <div className="flex flex-col gap-2">
                  <label htmlFor={`${uid}-edit`} className="text-xs font-bold tracking-wide text-fg-3 uppercase">
                    {t("studio2.rv.edit")}
                  </label>
                  <Textarea id={`${uid}-edit`} value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-20" dir="auto" autoFocus />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!draft.trim() || draft === sentence}
                      onClick={() => {
                        props.onReplace(loc.start, loc.end, draft.trim());
                        setEditing(false);
                      }}
                    >
                      <Check />
                      {t("studio2.rv.apply")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                      {t("studio2.rv.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraft(sentence);
                      setEditing(true);
                      props.onActivate(claimKey(claim), false);
                    }}
                  >
                    <Pencil />
                    {t("studio2.rv.edit")}
                  </Button>
                  {!kept && (
                    <Button size="sm" variant="ghost" onClick={() => onKeep(true)}>
                      {t("studio2.rv.keep")}
                    </Button>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </li>
  );
}

export function EvidenceReview(props: ReviewProps) {
  const { t } = useI18n();
  const descId = useId();
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [desc, setDesc] = useState("");
  const { report, content, activeKey, onActivate } = props;

  const claims = useMemo(() => report?.claims ?? [], [report]);
  const flagged = useMemo(() => {
    const pos = (c: VerifiedClaim) => locateClaim(content, c)?.start ?? Number.MAX_SAFE_INTEGER;
    return claims
      .filter((c) => reviewStatus(c.status) !== "supported")
      .sort((a, b) => Number(kept.has(claimKey(a))) - Number(kept.has(claimKey(b))) || pos(a) - pos(b));
  }, [claims, content, kept]);
  const supported = claims.filter((c) => reviewStatus(c.status) === "supported");

  return (
    <section aria-labelledby="evidence-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="evidence-h" className="flex items-center gap-2 text-sm font-extrabold text-fg">
          <ShieldCheck className="size-4 text-primary-text" aria-hidden />
          {t("studio2.rv.title")}
        </h2>
        <StateChip state={props.state} />
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-fg-3">{t("studio2.rv.sub")}</p>

      {props.state === "stale" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-sm text-fg">
          <span className="flex-1">{t("studio2.rv.stale")}</span>
          <Button size="sm" variant="secondary" onClick={props.onRecheck}>
            <RefreshCw />
            {t("studio2.rv.recheck")}
          </Button>
        </div>
      )}
      {props.state === "error" && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-fg-2">
          <span className="flex-1">{t("studio2.rv.error")}</span>
          <Button size="sm" variant="secondary" onClick={props.onRecheck}>
            <RefreshCw />
            {t("studio2.rv.recheck")}
          </Button>
        </div>
      )}
      {props.state === "need-description" && (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary-soft/40 px-3.5 py-3">
          <p className="text-sm font-bold text-fg">{t("studio2.rv.desc.t")}</p>
          <p className="text-xs leading-relaxed text-fg-2">{t("studio2.rv.desc.d")}</p>
          <label htmlFor={descId} className="sr-only">
            {t("studio2.rv.desc.label")}
          </label>
          <Textarea id={descId} value={desc} onChange={(e) => setDesc(e.target.value)} className="min-h-20 bg-surface" placeholder={t("studio2.rv.desc.label")} dir="auto" />
          <Button size="sm" className="w-fit" disabled={desc.trim().length < 20} onClick={() => props.onProvideDescription(desc.trim())}>
            <RefreshCw />
            {t("studio2.rv.desc.use")}
          </Button>
        </div>
      )}

      {report && <Summary report={report} />}

      {flagged.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {flagged.map((c) => {
            const k = claimKey(c);
            return (
              <ClaimCard
                key={k}
                claim={c}
                props={props}
                open={activeKey === k}
                onToggle={() => onActivate(activeKey === k ? null : k, activeKey !== k)}
                kept={kept.has(k)}
                onKeep={(v) =>
                  setKept((prev) => {
                    const next = new Set(prev);
                    if (v) next.add(k);
                    else next.delete(k);
                    return next;
                  })
                }
              />
            );
          })}
        </ul>
      )}

      {supported.length > 0 && (
        <details className="rounded-xl border border-border bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-fg-2">
            <CircleCheck className="me-1.5 inline size-4 text-ok" aria-hidden />
            {fill(t("studio2.rv.supported.list"), { n: supported.length })}
          </summary>
          <ul className="mt-3 flex flex-col gap-2.5">
            {supported.map((c) => (
              <li key={claimKey(c)} className="text-sm">
                <span className="font-semibold text-fg">
                  <Quoted text={c.value || c.text} />
                </span>
                {c.evidence[0] && (
                  <span className="mt-0.5 block border-s-2 border-ok/40 ps-2 text-xs text-fg-3" dir="auto">
                    {c.evidence[0].quote}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs leading-relaxed text-fg-3">{t("studio2.rv.foot")}</p>
    </section>
  );
}

export { claimAt, claimKey, removeRange };
