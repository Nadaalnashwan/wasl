"use client";

import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { useI18n, type TKey } from "@/lib/i18n";
import type { CVData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { type ListKey, newItemId, normalizeCV, type SectionKey, itemHeading } from "./model";

/* ------------------------------------------------------------------ small inputs */

/** Chip input for short lists (skills, languages, links, technologies). */
export function TagInput({
  id,
  value,
  onChange,
  placeholder,
  removeLabel,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  removeLabel: string;
}) {
  const [text, setText] = React.useState("");
  const commit = (raw: string) => {
    const parts = raw
      .split(/[,،\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const seen = new Set(value.map((v) => v.toLowerCase()));
    const next = [...value];
    for (const p of parts) {
      if (!seen.has(p.toLowerCase())) {
        next.push(p);
        seen.add(p.toLowerCase());
      }
    }
    onChange(next);
    setText("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
      {value.map((v, i) => (
        <span key={v + i} className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-2 py-0.5 ps-2 pe-1 text-xs text-fg">
          <span className="min-w-0 truncate">{v}</span>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            className="grid size-4 shrink-0 place-items-center rounded text-fg-3 hover:bg-surface-3 hover:text-fg"
            aria-label={`${removeLabel}: ${v}`}
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={text}
        dir="auto"
        onChange={(e) => {
          const v = e.target.value;
          if (/[,،]/.test(v)) commit(v);
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(text);
          } else if (e.key === "Backspace" && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(text)}
        placeholder={value.length ? undefined : placeholder}
        className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-fg placeholder:text-fg-3 focus:outline-none"
      />
    </div>
  );
}

function BulletEditor({ value, onChange, label }: { value: string[]; onChange: (v: string[]) => void; label: string }) {
  const { t } = useI18n();
  const set = (i: number, v: string) => onChange(value.map((b, j) => (j === i ? v : b)));
  return (
    <Field label={label} group hint={t("cv2.ed.bulletsHint")} className="sm:col-span-2">
      <ol className="flex flex-col gap-2">
        {value.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-fg-3" />
            <Textarea
              value={b}
              dir="auto"
              onChange={(e) => set(i, e.target.value.replace(/\n/g, " "))}
              aria-label={`${t("cv2.f.bullet")} ${i + 1}`}
              className="min-h-16 flex-1"
              rows={2}
            />
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label={`${t("cv2.ed.removeBullet")} ${i + 1}`}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ol>
      <Button size="xs" variant="ghost" className="self-start" onClick={() => onChange([...value, ""])}>
        <Plus /> {t("cv2.ed.addBullet")}
      </Button>
    </Field>
  );
}

/* ------------------------------------------------------------------ list sections */

type FieldDef = { key: string; label: TKey; kind?: "text" | "long" | "bullets" | "tags"; placeholder?: TKey; wide?: boolean };

const FIELDS: Record<ListKey, FieldDef[]> = {
  experience: [
    { key: "title", label: "cv2.f.title" },
    { key: "organization", label: "cv2.f.organization" },
    { key: "location", label: "cv2.f.location" },
    { key: "start", label: "cv2.f.start", placeholder: "cv2.ph.start" },
    { key: "end", label: "cv2.f.end", placeholder: "cv2.ph.end" },
    { key: "bullets", label: "cv2.f.bullets", kind: "bullets" },
  ],
  education: [
    { key: "degree", label: "cv2.f.degree" },
    { key: "institution", label: "cv2.f.institution" },
    { key: "start", label: "cv2.f.start", placeholder: "cv2.ph.start" },
    { key: "end", label: "cv2.f.end", placeholder: "cv2.ph.end" },
    { key: "details", label: "cv2.f.details", kind: "long" },
  ],
  projects: [
    { key: "name", label: "cv2.f.name" },
    { key: "link", label: "cv2.f.link", placeholder: "cv2.ph.link" },
    { key: "description", label: "cv2.f.description", kind: "long" },
    { key: "technologies", label: "cv2.f.technologies", kind: "tags" },
    { key: "bullets", label: "cv2.f.bullets", kind: "bullets" },
  ],
  certifications: [
    { key: "name", label: "cv2.f.name" },
    { key: "issuer", label: "cv2.f.issuer" },
    { key: "date", label: "cv2.f.date" },
  ],
  awards: [
    { key: "title", label: "cv2.f.title" },
    { key: "issuer", label: "cv2.f.issuer" },
    { key: "date", label: "cv2.f.date" },
    { key: "description", label: "cv2.f.description", kind: "long" },
  ],
};

const TEMPLATES: Record<ListKey, () => Record<string, unknown>> = {
  experience: () => ({ id: newItemId(), title: "", organization: "", location: "", start: "", end: "", bullets: [] }),
  education: () => ({ id: newItemId(), degree: "", institution: "", start: "", end: "", details: "" }),
  projects: () => ({ id: newItemId(), name: "", description: "", technologies: [], bullets: [], link: "" }),
  certifications: () => ({ id: newItemId(), name: "", issuer: "", date: "" }),
  awards: () => ({ id: newItemId(), title: "", issuer: "", date: "", description: "" }),
};

const ADD_LABEL: Record<ListKey, TKey> = {
  experience: "cv2.ed.add.experience",
  education: "cv2.ed.add.education",
  projects: "cv2.ed.add.projects",
  certifications: "cv2.ed.add.certifications",
  awards: "cv2.ed.add.awards",
};

function ItemEditor({
  section,
  item,
  index,
  total,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
  idBase,
}: {
  section: ListKey;
  item: Record<string, unknown>;
  index: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  onChange: (it: Record<string, unknown>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  idBase: string;
}) {
  const { t } = useI18n();
  const head = itemHeading(section, item);
  const panelId = `${idBase}-panel`;
  return (
    <li className="rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-1 ps-3 pe-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-start"
        >
          <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform", !open && "-rotate-90 rtl:rotate-90")} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className={cn("font-medium", head.title ? "text-fg" : "text-fg-3")}>{head.title || t("cv2.ed.untitled")}</span>
            {head.sub && <span className="text-fg-3"> · {head.sub}</span>}
          </span>
        </button>
        <Button size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t("cv2.ed.moveUp")}>
          <ArrowUp />
        </Button>
        <Button size="icon-sm" variant="ghost" disabled={index === total - 1} onClick={() => onMove(1)} aria-label={t("cv2.ed.moveDown")}>
          <ArrowDown />
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onRemove} aria-label={`${t("common.delete")}: ${head.title || t("cv2.ed.untitled")}`}>
          <Trash2 />
        </Button>
      </div>
      {open && (
        <div id={panelId} className="grid gap-3 border-t border-border px-3 py-3 sm:grid-cols-2">
          {FIELDS[section].map((f) => {
            const fid = `${idBase}-${f.key}`;
            const v = item[f.key];
            if (f.kind === "bullets") {
              return (
                <BulletEditor
                  key={f.key}
                  label={t(f.label)}
                  value={Array.isArray(v) ? (v as string[]) : []}
                  onChange={(b) => onChange({ ...item, [f.key]: b })}
                />
              );
            }
            if (f.kind === "tags") {
              return (
                <Field key={f.key} label={t(f.label)} htmlFor={fid} hint={t("cv2.ed.tagsHint")} className="sm:col-span-2">
                  <TagInput
                    id={fid}
                    value={Array.isArray(v) ? (v as string[]) : []}
                    onChange={(x) => onChange({ ...item, [f.key]: x })}
                    removeLabel={t("cv2.ed.remove")}
                  />
                </Field>
              );
            }
            return (
              <Field key={f.key} label={t(f.label)} className={cn(f.kind === "long" && "sm:col-span-2")}>
                {f.kind === "long" ? (
                  <Textarea dir="auto" value={String(v ?? "")} onChange={(e) => onChange({ ...item, [f.key]: e.target.value })} className="min-h-20" />
                ) : (
                  <Input
                    dir="auto"
                    value={String(v ?? "")}
                    onChange={(e) => onChange({ ...item, [f.key]: e.target.value })}
                    placeholder={f.placeholder ? t(f.placeholder) : undefined}
                  />
                )}
              </Field>
            );
          })}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------ section shell */

function EditorSection({
  id,
  title,
  meta,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  meta?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panel = `${id}-body`;
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24">
      <h3 id={`${id}-h`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panel}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-surface-2/60"
        >
          <span className="flex-1 text-sm font-semibold text-fg">{title}</span>
          {meta && <span className="text-xs text-fg-3">{meta}</span>}
          <ChevronDown className={cn("size-4 shrink-0 text-fg-3 transition-transform", !open && "-rotate-90 rtl:rotate-90")} aria-hidden />
        </button>
      </h3>
      {open && (
        <div id={panel} className="px-4 pt-1 pb-5">
          {children}
        </div>
      )}
    </section>
  );
}

const SECTION_TITLE: Record<SectionKey, TKey> = {
  contact: "cv2.sec.contact",
  summary: "cv.section.summary",
  experience: "cv.section.experience",
  education: "cv.section.education",
  projects: "cv.section.projects",
  skills: "cv.section.skills",
  certifications: "cv.section.certifications",
  awards: "cv.section.awards",
  languages: "cv.section.languages",
};

export function sectionTitleKey(k: SectionKey): TKey {
  return SECTION_TITLE[k];
}

/* ------------------------------------------------------------------ editor */

/** Controlled structured editor. Every keystroke updates `value`, so a preview can render live. */
export function CVEditor({
  value,
  onChange,
  idPrefix = "cv",
  defaultOpen = ["contact", "summary", "experience"],
}: {
  value: CVData;
  onChange: (v: CVData) => void;
  idPrefix?: string;
  defaultOpen?: SectionKey[];
}) {
  const { t } = useI18n();
  const cv = normalizeCV(value);
  const [openSections, setOpenSections] = React.useState<Set<string>>(() => new Set(defaultOpen));
  const [openItems, setOpenItems] = React.useState<Set<string>>(() => new Set());
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, k: string) =>
    set((prev) => {
      const n = new Set(prev);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const patch = (p: Partial<CVData>) => onChange({ ...cv, ...p });
  const setContact = (k: keyof CVData["contact"], v: string | string[]) => patch({ contact: { ...cv.contact, [k]: v } });

  const listSection = (k: ListKey) => {
    const items = cv[k] as unknown as Record<string, unknown>[];
    const setItems = (next: Record<string, unknown>[]) => patch({ [k]: next } as Partial<CVData>);
    return (
      <EditorSection
        key={k}
        id={`${idPrefix}-${k}`}
        title={t(SECTION_TITLE[k])}
        meta={items.length ? <span className="num">{items.length}</span> : t("cv2.ed.none")}
        open={openSections.has(k)}
        onToggle={() => toggle(setOpenSections, k)}
      >
        <ul className="flex flex-col gap-2">
          {items.map((it, i) => (
            <ItemEditor
              key={String(it.id) || i}
              idBase={`${idPrefix}-${k}-${String(it.id) || i}`}
              section={k}
              item={it}
              index={i}
              total={items.length}
              open={openItems.has(String(it.id))}
              onToggle={() => toggle(setOpenItems, String(it.id))}
              onChange={(n) => setItems(items.map((x, j) => (j === i ? n : x)))}
              onMove={(d) => {
                const j = i + d;
                if (j < 0 || j >= items.length) return;
                const next = [...items];
                [next[i], next[j]] = [next[j], next[i]];
                setItems(next);
              }}
              onRemove={() => setItems(items.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
        <Button
          size="sm"
          variant="secondary"
          className={cn(items.length > 0 && "mt-3")}
          onClick={() => {
            const it = TEMPLATES[k]();
            setItems([...items, it]);
            setOpenItems((prev) => new Set(prev).add(String(it.id)));
          }}
        >
          <Plus /> {t(ADD_LABEL[k])}
        </Button>
      </EditorSection>
    );
  };

  const contactFields: { k: Exclude<keyof CVData["contact"], "links">; label: TKey; type?: string }[] = [
    { k: "full_name", label: "cv2.f.full_name" },
    { k: "headline", label: "cv2.f.headline" },
    { k: "email", label: "cv2.f.email", type: "email" },
    { k: "phone", label: "cv2.f.phone", type: "tel" },
    { k: "location", label: "cv2.f.location" },
  ];

  return (
    <div className="divide-y divide-border rounded-lg border border-border-soft bg-surface">
      <EditorSection
        id={`${idPrefix}-contact`}
        title={t("cv2.sec.contact")}
        meta={cv.contact.full_name || t("cv2.ed.none")}
        open={openSections.has("contact")}
        onToggle={() => toggle(setOpenSections, "contact")}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {contactFields.map((f) => (
            <Field key={f.k} label={t(f.label)} className={cn(f.k === "headline" && "sm:col-span-2")}>
              <Input
                type={f.type}
                dir="auto"
                value={cv.contact[f.k]}
                onChange={(e) => setContact(f.k, e.target.value)}
                autoComplete={f.k === "full_name" ? "name" : f.k === "email" ? "email" : f.k === "phone" ? "tel" : undefined}
              />
            </Field>
          ))}
          <Field label={t("cv2.f.links")} htmlFor={`${idPrefix}-links`} hint={t("cv2.ed.tagsHint")} className="sm:col-span-2">
            <TagInput
              id={`${idPrefix}-links`}
              value={cv.contact.links}
              onChange={(v) => setContact("links", v)}
              placeholder={t("cv2.ph.link")}
              removeLabel={t("cv2.ed.remove")}
            />
          </Field>
        </div>
      </EditorSection>

      <EditorSection
        id={`${idPrefix}-summary`}
        title={t("cv.section.summary")}
        meta={cv.summary ? <span className="num">{cv.summary.length}</span> : t("cv2.ed.none")}
        open={openSections.has("summary")}
        onToggle={() => toggle(setOpenSections, "summary")}
      >
        <Field label={t("cv.section.summary")} hint={t("cv2.ed.summaryHint")}>
          <Textarea dir="auto" value={cv.summary} onChange={(e) => patch({ summary: e.target.value })} className="min-h-28" />
        </Field>
      </EditorSection>

      {listSection("experience")}
      {listSection("education")}
      {listSection("projects")}

      <EditorSection
        id={`${idPrefix}-skills`}
        title={t("cv.section.skills")}
        meta={cv.skills.length ? <span className="num">{cv.skills.length}</span> : t("cv2.ed.none")}
        open={openSections.has("skills")}
        onToggle={() => toggle(setOpenSections, "skills")}
      >
        <Field label={t("cv.section.skills")} htmlFor={`${idPrefix}-skills-input`} hint={t("cv2.ed.skillsHint")}>
          <TagInput
            id={`${idPrefix}-skills-input`}
            value={cv.skills}
            onChange={(v) => patch({ skills: v })}
            placeholder={t("cv2.ph.skill")}
            removeLabel={t("cv2.ed.remove")}
          />
        </Field>
      </EditorSection>

      {listSection("certifications")}
      {listSection("awards")}

      <EditorSection
        id={`${idPrefix}-languages`}
        title={t("cv.section.languages")}
        meta={cv.languages.length ? <span className="num">{cv.languages.length}</span> : t("cv2.ed.none")}
        open={openSections.has("languages")}
        onToggle={() => toggle(setOpenSections, "languages")}
      >
        <Field label={t("cv.section.languages")} htmlFor={`${idPrefix}-languages-input`} hint={t("cv2.ed.tagsHint")}>
          <TagInput
            id={`${idPrefix}-languages-input`}
            value={cv.languages}
            onChange={(v) => patch({ languages: v })}
            placeholder={t("cv2.ph.language")}
            removeLabel={t("cv2.ed.remove")}
          />
        </Field>
      </EditorSection>
    </div>
  );
}
