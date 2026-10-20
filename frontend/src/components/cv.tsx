"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/form";
import { splitList } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { CVData } from "@/lib/types";
import { cn, isArabic } from "@/lib/utils";

export const EMPTY_CV: CVData = {
  contact: { full_name: "", headline: "", email: "", phone: "", location: "", links: [] },
  summary: "",
  experience: [],
  education: [],
  projects: [],
  certifications: [],
  awards: [],
  skills: [],
  languages: [],
};

export function normalizeCV(d: Partial<CVData> | null | undefined): CVData {
  return { ...EMPTY_CV, ...(d || {}), contact: { ...EMPTY_CV.contact, ...(d?.contact || {}) } } as CVData;
}

const uid = () => Math.random().toString(16).slice(2, 12);

type Highlight = { ids?: Set<string>; bullets?: Set<string>; skills?: Set<string>; summary?: boolean };

function H({ on, children, className }: { on?: boolean; children: React.ReactNode; className?: string }) {
  return <span className={cn(on && "marker", className)}>{children}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 border-b-2 border-ink pb-1 font-hand text-xl text-brand">{title}</h3>
      {children}
    </section>
  );
}

export function CVView({ data, highlight, className }: { data: CVData; highlight?: Highlight; className?: string }) {
  const { t } = useI18n();
  const cv = normalizeCV(data);
  const rtl = isArabic([cv.contact.full_name, cv.summary, ...cv.experience.map((e) => e.title)].join(" "));
  const hl = highlight ?? {};
  const bullets = (bs: string[]) =>
    bs.length > 0 && (
      <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm">
        {bs.map((b, i) => (
          <li key={i}>
            <H on={hl.bullets?.has(b)}>{b}</H>
          </li>
        ))}
      </ul>
    );
  return (
    <div dir={rtl ? "rtl" : "ltr"} className={cn("sketch-soft bg-paper p-6 text-ink", className)}>
      <div className="font-hand text-3xl text-brand">{cv.contact.full_name || "—"}</div>
      {cv.contact.headline && <div className="text-ink-soft">{cv.contact.headline}</div>}
      <div className="mt-1 text-xs text-ink-faint">
        {[cv.contact.email, cv.contact.phone, cv.contact.location, ...cv.contact.links].filter(Boolean).join(" · ")}
      </div>
      {cv.summary && (
        <Section title={t("cv.section.summary")}>
          <p className="text-sm">
            <H on={hl.summary}>{cv.summary}</H>
          </p>
        </Section>
      )}
      {cv.experience.length > 0 && (
        <Section title={t("cv.section.experience")}>
          <div className="space-y-3">
            {cv.experience.map((e) => (
              <div key={e.id} className={cn(hl.ids?.has(e.id) && "rounded-lg bg-sky/60 p-2")}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <b>{e.title}</b>
                  {e.organization && <span className="text-ink-soft">— {e.organization}</span>}
                  <span className="ms-auto text-xs text-ink-faint">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
                </div>
                {bullets(e.bullets)}
              </div>
            ))}
          </div>
        </Section>
      )}
      {cv.projects.length > 0 && (
        <Section title={t("cv.section.projects")}>
          <div className="space-y-3">
            {cv.projects.map((p) => (
              <div key={p.id} className={cn(hl.ids?.has(p.id) && "rounded-lg bg-sky/60 p-2")}>
                <div className="flex flex-wrap items-baseline gap-2">
                  <b>{p.name}</b>
                  {hl.ids?.has(p.id) && <Badge tone="brand">new</Badge>}
                  {p.technologies.length > 0 && <span className="text-xs text-ink-faint">{p.technologies.join(", ")}</span>}
                </div>
                {p.description && <p className="text-sm text-ink-soft">{p.description}</p>}
                {bullets(p.bullets)}
              </div>
            ))}
          </div>
        </Section>
      )}
      {cv.education.length > 0 && (
        <Section title={t("cv.section.education")}>
          {cv.education.map((e) => (
            <div key={e.id} className={cn("text-sm", hl.ids?.has(e.id) && "rounded-lg bg-sky/60 p-2")}>
              <b>{e.degree}</b> {e.institution && <>— {e.institution}</>} <span className="text-xs text-ink-faint">{[e.start, e.end].filter(Boolean).join(" – ")}</span>
              {e.details && <p className="text-ink-soft">{e.details}</p>}
            </div>
          ))}
        </Section>
      )}
      {cv.certifications.length > 0 && (
        <Section title={t("cv.section.certifications")}>
          <ul className="space-y-1 text-sm">
            {cv.certifications.map((c) => (
              <li key={c.id} className={cn(hl.ids?.has(c.id) && "rounded-lg bg-sky/60 p-1")}>
                <b>{c.name}</b> {c.issuer && <>· {c.issuer}</>} {c.date && <span className="text-xs text-ink-faint">· {c.date}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {cv.awards.length > 0 && (
        <Section title={t("cv.section.awards")}>
          <ul className="space-y-1 text-sm">
            {cv.awards.map((a) => (
              <li key={a.id} className={cn(hl.ids?.has(a.id) && "rounded-lg bg-sky/60 p-1")}>
                <b>{a.title}</b> {a.issuer && <>· {a.issuer}</>} {a.date && <span className="text-xs text-ink-faint">· {a.date}</span>}
                {a.description && <p className="text-ink-soft">{a.description}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {cv.skills.length > 0 && (
        <Section title={t("cv.section.skills")}>
          <div className="flex flex-wrap gap-1.5">
            {cv.skills.map((s) => (
              <Badge key={s} tone={hl.skills?.has(s) ? "brand" : "sky"}>
                {s}
              </Badge>
            ))}
          </div>
        </Section>
      )}
      {cv.languages.length > 0 && (
        <Section title={t("cv.section.languages")}>
          <p className="text-sm">{cv.languages.join(", ")}</p>
        </Section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ editor */
type ListKey = "experience" | "education" | "projects" | "certifications" | "awards";

const TEMPLATES: Record<ListKey, () => Record<string, unknown>> = {
  experience: () => ({ id: uid(), title: "", organization: "", location: "", start: "", end: "", bullets: [] }),
  education: () => ({ id: uid(), degree: "", institution: "", start: "", end: "", details: "" }),
  projects: () => ({ id: uid(), name: "", description: "", technologies: [], bullets: [], link: "" }),
  certifications: () => ({ id: uid(), name: "", issuer: "", date: "" }),
  awards: () => ({ id: uid(), title: "", issuer: "", date: "", description: "" }),
};

const FIELDS: Record<ListKey, { key: string; label: string; kind?: "lines" | "list" | "long" }[]> = {
  experience: [
    { key: "title", label: "Title" },
    { key: "organization", label: "Organization" },
    { key: "location", label: "Location" },
    { key: "start", label: "Start" },
    { key: "end", label: "End" },
    { key: "bullets", label: "Bullets (one per line)", kind: "lines" },
  ],
  education: [
    { key: "degree", label: "Degree" },
    { key: "institution", label: "Institution" },
    { key: "start", label: "Start" },
    { key: "end", label: "End" },
    { key: "details", label: "Details", kind: "long" },
  ],
  projects: [
    { key: "name", label: "Name" },
    { key: "link", label: "Link" },
    { key: "description", label: "Description", kind: "long" },
    { key: "technologies", label: "Technologies (comma separated)", kind: "list" },
    { key: "bullets", label: "Bullets (one per line)", kind: "lines" },
  ],
  certifications: [
    { key: "name", label: "Name" },
    { key: "issuer", label: "Issuer" },
    { key: "date", label: "Date" },
  ],
  awards: [
    { key: "title", label: "Title" },
    { key: "issuer", label: "Issuer" },
    { key: "date", label: "Date" },
    { key: "description", label: "Description", kind: "long" },
  ],
};

function ListEditor({ k, items, onItems }: { k: ListKey; items: Record<string, unknown>[]; onItems: (items: Record<string, unknown>[]) => void }) {
  const { t } = useI18n();
  const update = (i: number, key: string, raw: string, kind?: string) => {
    const v = kind === "lines" ? raw.split("\n").map((x) => x.trim()).filter(Boolean) : kind === "list" ? splitList(raw) : raw;
    const next = items.map((it, j) => (j === i ? { ...it, [key]: v } : it));
    onItems(next);
  };
  return (
    <fieldset className="sketch-soft flex flex-col gap-3 p-4">
      <legend className="px-2 font-hand text-xl">{t(`cv.section.${k}` as never)}</legend>
      {items.map((it, i) => (
        <div key={String(it.id)} className="grid gap-3 rounded-xl bg-paper-2 p-3 sm:grid-cols-2">
          {FIELDS[k].map((f) => (
            <Field key={f.key} label={f.label} className={cn((f.kind === "lines" || f.kind === "long") && "sm:col-span-2")}>
              {f.kind === "lines" || f.kind === "long" ? (
                <Textarea
                  defaultValue={Array.isArray(it[f.key]) ? (it[f.key] as string[]).join("\n") : String(it[f.key] ?? "")}
                  onBlur={(e) => update(i, f.key, e.target.value, f.kind)}
                  className="min-h-20"
                />
              ) : (
                <Input
                  defaultValue={Array.isArray(it[f.key]) ? (it[f.key] as string[]).join(", ") : String(it[f.key] ?? "")}
                  onBlur={(e) => update(i, f.key, e.target.value, f.kind)}
                />
              )}
            </Field>
          ))}
          <div className="sm:col-span-2">
            <Button size="sm" variant="ghost" type="button" onClick={() => onItems(items.filter((_, j) => j !== i))}>
              <Trash2 /> {t("common.delete")}
            </Button>
          </div>
        </div>
      ))}
      <Button size="sm" variant="secondary" type="button" className="self-start" onClick={() => onItems([...items, TEMPLATES[k]()])}>
        <Plus /> {t("common.new")}
      </Button>
    </fieldset>
  );
}


export function CVEditor({ value, onChange }: { value: CVData; onChange: (v: CVData) => void }) {
  const { t } = useI18n();
  const cv = normalizeCV(value);
  const set = (patch: Partial<CVData>) => onChange({ ...cv, ...patch });
  const setContact = (k: keyof CVData["contact"], v: string) =>
    set({ contact: { ...cv.contact, [k]: k === "links" ? splitList(v) : v } as CVData["contact"] });

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="sketch-soft grid gap-3 p-4 sm:grid-cols-2">
        <legend className="px-2 font-hand text-xl">Contact</legend>
        {(["full_name", "headline", "email", "phone", "location"] as const).map((k) => (
          <Field key={k} label={k.replace("_", " ")}>
            <Input defaultValue={cv.contact[k]} onBlur={(e) => setContact(k, e.target.value)} />
          </Field>
        ))}
        <Field label="links (comma separated)">
          <Input defaultValue={cv.contact.links.join(", ")} onBlur={(e) => setContact("links", e.target.value)} />
        </Field>
      </fieldset>
      <Field label={t("cv.section.summary")}>
        <Textarea defaultValue={cv.summary} onBlur={(e) => set({ summary: e.target.value })} />
      </Field>
      {(["experience", "projects", "education", "certifications", "awards"] as ListKey[]).map((k) => (
        <ListEditor key={k} k={k} items={cv[k] as unknown as Record<string, unknown>[]} onItems={(items) => set({ [k]: items } as Partial<CVData>)} />
      ))}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("cv.section.skills")} hint="comma separated">
          <Textarea defaultValue={cv.skills.join(", ")} onBlur={(e) => set({ skills: splitList(e.target.value) })} className="min-h-20" />
        </Field>
        <Field label={t("cv.section.languages")} hint="comma separated">
          <Textarea defaultValue={cv.languages.join(", ")} onBlur={(e) => set({ languages: splitList(e.target.value) })} className="min-h-20" />
        </Field>
      </div>
    </div>
  );
}
