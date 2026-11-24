"use client";

import * as React from "react";
import { useI18n } from "@/lib/i18n";
import type { CVData } from "@/lib/types";
import { cn, isArabic } from "@/lib/utils";
import { dateRange, normalizeCV } from "./model";

/**
 * Marks drawn on the document.
 *  - "add" tone (suggestions): green — content that would be added.
 *  - "change" tone (tailoring): blue — content that was rewritten.
 * struckBullets renders bullets that were replaced (original side of a comparison).
 */
export type DocMarks = {
  addedIds?: Set<string>;
  changedIds?: Set<string>;
  bullets?: Set<string>;
  struckBullets?: Set<string>;
  skills?: Set<string>;
  summary?: boolean;
  tone?: "add" | "change";
};

function Mark({ on, tone, children }: { on?: boolean; tone: "add" | "change"; children: React.ReactNode }) {
  const { t } = useI18n();
  if (!on) return <>{children}</>;
  return (
    <mark className={cn("rounded-sm px-0.5 text-fg [box-decoration-break:clone]", tone === "add" ? "bg-ok-soft" : "bg-primary-soft")}>
      <span className="sr-only">{tone === "add" ? t("cv2.doc.added") : t("cv2.doc.changed")}: </span>
      {children}
    </mark>
  );
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="mb-2.5 border-b border-border pb-1 text-[11px] font-semibold uppercase tracking-[0.09em] text-primary-text rtl:tracking-normal">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Entry({
  id,
  marks,
  title,
  sub,
  meta,
  children,
}: {
  id: string;
  marks: DocMarks;
  title: React.ReactNode;
  sub?: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const tone = marks.tone ?? "add";
  const added = marks.addedIds?.has(id);
  const changed = marks.changedIds?.has(id);
  return (
    <div
      className={cn(
        "relative",
        (added || changed) && "-mx-2 rounded-md border-s-2 px-2 py-1.5",
        added && (tone === "add" ? "border-ok bg-ok-soft/60" : "border-primary bg-primary-soft/60"),
        changed && !added && "border-primary bg-primary-soft/40",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-fg">{title}</span>
          {sub && <span className="text-fg-2"> · {sub}</span>}
          {added && <span className="ms-2 align-middle text-[10px] font-semibold uppercase text-ok rtl:tracking-normal">{t("cv2.doc.added")}</span>}
          {changed && !added && (
            <span className="ms-2 align-middle text-[10px] font-semibold uppercase text-primary-text rtl:tracking-normal">{t("cv2.doc.changed")}</span>
          )}
        </div>
        {meta && <span className="num shrink-0 text-[11.5px] text-fg-3">{meta}</span>}
      </div>
      {children}
    </div>
  );
}

function Bullets({ items, marks }: { items: string[]; marks: DocMarks }) {
  const { t } = useI18n();
  const tone = marks.tone ?? "add";
  const shown = items.filter((b) => b.trim());
  if (!shown.length) return null;
  return (
    <ul className="mt-1 list-disc space-y-0.5 ps-4 marker:text-fg-3">
      {shown.map((b, i) => {
        const struck = marks.struckBullets?.has(b);
        return (
          <li key={i} className={cn(struck && "text-fg-3 line-through decoration-bad/60")}>
            {struck && <span className="sr-only">{t("cv2.doc.replaced")}: </span>}
            <Mark on={marks.bullets?.has(b)} tone={tone}>
              {b}
            </Mark>
          </li>
        );
      })}
    </ul>
  );
}

/** A print-like, typographic rendering of a structured CV. */
export function CVDocument({
  data,
  marks,
  className,
  compact,
  emptyHint,
  label,
}: {
  data: CVData;
  marks?: DocMarks;
  className?: string;
  compact?: boolean;
  emptyHint?: string;
  label?: string;
}) {
  const { t } = useI18n();
  const cv = normalizeCV(data);
  const m = marks ?? {};
  const tone = m.tone ?? "add";
  const rtl = isArabic([cv.contact.full_name, cv.contact.headline, cv.summary, ...cv.experience.map((e) => e.title)].join(" "));
  const contactLine = [cv.contact.email, cv.contact.phone, cv.contact.location, ...cv.contact.links].filter((x) => x && x.trim());
  const empty =
    !cv.contact.full_name &&
    !cv.summary &&
    !cv.experience.length &&
    !cv.education.length &&
    !cv.projects.length &&
    !cv.skills.length &&
    !cv.certifications.length &&
    !cv.awards.length &&
    !cv.languages.length;

  return (
    <article
      dir={rtl ? "rtl" : "ltr"}
      aria-label={label}
      className={cn(
        "doc-surface rounded-md text-[13px] leading-[1.6] text-fg",
        compact ? "px-5 py-6 sm:px-7 sm:py-7" : "px-6 py-8 sm:px-10 sm:py-10",
        className,
      )}
    >
      <header className={cn("pb-4", !empty && "mb-5 border-b border-border-strong")}>
        <h1 className={cn("font-semibold tracking-tight text-fg rtl:tracking-normal", compact ? "text-xl" : "text-[24px] leading-tight")}>
          {cv.contact.full_name || <span className="text-fg-3">{t("cv2.doc.noName")}</span>}
        </h1>
        {cv.contact.headline && <p className="mt-0.5 text-[14px] text-fg-2">{cv.contact.headline}</p>}
        {contactLine.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-2 text-[11.5px] text-fg-3">
            {contactLine.map((c, i) => (
              <span key={i} className="min-w-0 break-all">
                {i > 0 && <span aria-hidden className="me-2">·</span>}
                {c}
              </span>
            ))}
          </p>
        )}
      </header>

      {empty && <p className="py-10 text-center text-sm text-fg-3">{emptyHint ?? t("cv2.doc.empty")}</p>}

      {cv.summary && (
        <DocSection title={t("cv.section.summary")}>
          <p className="whitespace-pre-line text-fg-2">
            <Mark on={m.summary} tone={tone}>
              {cv.summary}
            </Mark>
          </p>
        </DocSection>
      )}

      {cv.experience.length > 0 && (
        <DocSection title={t("cv.section.experience")}>
          <div className="space-y-3.5">
            {cv.experience.map((e) => (
              <Entry
                key={e.id}
                id={e.id}
                marks={m}
                title={e.title || "—"}
                sub={e.organization}
                meta={[dateRange(e.start, e.end), e.location].filter(Boolean).join(" · ")}
              >
                <Bullets items={e.bullets} marks={m} />
              </Entry>
            ))}
          </div>
        </DocSection>
      )}

      {cv.education.length > 0 && (
        <DocSection title={t("cv.section.education")}>
          <div className="space-y-2.5">
            {cv.education.map((e) => (
              <Entry key={e.id} id={e.id} marks={m} title={e.degree || "—"} sub={e.institution} meta={dateRange(e.start, e.end)}>
                {e.details && <p className="mt-0.5 text-fg-2">{e.details}</p>}
              </Entry>
            ))}
          </div>
        </DocSection>
      )}

      {cv.projects.length > 0 && (
        <DocSection title={t("cv.section.projects")}>
          <div className="space-y-3.5">
            {cv.projects.map((p) => (
              <Entry key={p.id} id={p.id} marks={m} title={p.name || "—"} meta={p.link ? <span className="break-all">{p.link}</span> : undefined}>
                {p.technologies.length > 0 && <p className="text-[11.5px] text-fg-3">{p.technologies.join(" · ")}</p>}
                {p.description && <p className="mt-0.5 text-fg-2">{p.description}</p>}
                <Bullets items={p.bullets} marks={m} />
              </Entry>
            ))}
          </div>
        </DocSection>
      )}

      {cv.skills.length > 0 && (
        <DocSection title={t("cv.section.skills")}>
          <p className="text-fg-2">
            {cv.skills.map((s, i) => (
              <React.Fragment key={s + i}>
                {i > 0 && <span aria-hidden className="text-fg-3"> · </span>}
                <Mark on={m.skills?.has(s)} tone={tone}>
                  {s}
                </Mark>
              </React.Fragment>
            ))}
          </p>
        </DocSection>
      )}

      {cv.certifications.length > 0 && (
        <DocSection title={t("cv.section.certifications")}>
          <div className="space-y-1.5">
            {cv.certifications.map((c) => (
              <Entry key={c.id} id={c.id} marks={m} title={c.name || "—"} sub={c.issuer} meta={c.date} />
            ))}
          </div>
        </DocSection>
      )}

      {cv.awards.length > 0 && (
        <DocSection title={t("cv.section.awards")}>
          <div className="space-y-2">
            {cv.awards.map((a) => (
              <Entry key={a.id} id={a.id} marks={m} title={a.title || "—"} sub={a.issuer} meta={a.date}>
                {a.description && <p className="mt-0.5 text-fg-2">{a.description}</p>}
              </Entry>
            ))}
          </div>
        </DocSection>
      )}

      {cv.languages.length > 0 && (
        <DocSection title={t("cv.section.languages")}>
          <p className="text-fg-2">{cv.languages.join(" · ")}</p>
        </DocSection>
      )}
    </article>
  );
}
