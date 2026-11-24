"use client";

import { Check, FileText, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { ErrorNote } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { Badge, DescriptionList, Separator } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { ConfirmDialog, Dialog, DrawerContent } from "@/components/ui/overlay";
import { splitList } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n";
import type { Achievement } from "@/lib/types";
import { fmtDate, isArabic } from "@/lib/utils";
import { ConfidenceText, CvUpdateNotice, DecisionStatus, EvidencePanel } from "./evidence";
import { ContributionField, DuplicateNotice } from "./review";
import { CATEGORIES, fmt, sourceRef, SOURCE_ICON, type Category } from "./shared";
import { useAchievementActions } from "./use-achievement-actions";

function SubHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <h3 className="flex-1 text-sm font-semibold text-fg">{children}</h3>
      {action}
    </div>
  );
}

function EditForm({
  a,
  busy,
  onCancel,
  onSave,
}: {
  a: Achievement;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: Parameters<ReturnType<typeof useAchievementActions>["save"]>[1]) => void;
}) {
  const { t } = useI18n();
  const [f, setF] = useState({
    title: a.title,
    description: a.description,
    category: a.category as Category,
    occurred_on: a.occurred_on,
    technologies: a.technologies.join(", "),
    skills: a.skills.join(", "),
    impact: a.impact,
    contribution_note: a.contribution_note,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({
          title: f.title.trim(),
          description: f.description,
          category: f.category,
          occurred_on: f.occurred_on,
          technologies: splitList(f.technologies),
          skills: splitList(f.skills),
          impact: f.impact,
          ...(a.status !== "pending" ? { contribution_note: f.contribution_note } : {}),
        });
      }}
    >
      <Field label={t("ach.title")} className="sm:col-span-2">
        <Input required minLength={3} maxLength={300} value={f.title} onChange={set("title")} dir="auto" />
      </Field>
      <Field label={t("achievements2.meta.description")} className="sm:col-span-2">
        <Textarea value={f.description} maxLength={4000} onChange={set("description")} dir="auto" />
      </Field>
      <Field label={t("ach.category")}>
        <Select value={f.category} onChange={set("category")}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`ach.cat.${c}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("ach.date")}>
        <Input value={f.occurred_on} maxLength={20} placeholder={t("achievements2.add.date.ph")} onChange={set("occurred_on")} />
      </Field>
      <Field label={t("ach.technologies")}>
        <Input value={f.technologies} onChange={set("technologies")} />
      </Field>
      <Field label={t("ach.skills")}>
        <Input value={f.skills} onChange={set("skills")} />
      </Field>
      <Field label={t("ach.impact")} className="sm:col-span-2">
        <Input value={f.impact} maxLength={1500} onChange={set("impact")} dir="auto" />
      </Field>
      {a.status !== "pending" && (
        <Field label={t("achievements2.contrib.title")} className="sm:col-span-2">
          <Textarea value={f.contribution_note} maxLength={1500} onChange={set("contribution_note")} className="min-h-20" dir="auto" />
        </Field>
      )}
      <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" variant="secondary" loading={busy} disabled={f.title.trim().length < 3}>
          {t("achievements2.edit.save")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Detail side sheet: evidence, details (editable), contribution, decision and Master CV update.
 * Mount with `key={a.id}` so local state resets per achievement.
 */
export function AchievementDrawer({
  a,
  open,
  onOpenChange,
  onChanged,
  onDeleted,
}: {
  a: Achievement;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: (a: Achievement) => void;
  onDeleted: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const [editing, setEditing] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [note, setNote] = useState(a.contribution_note || "");
  const actions = useAchievementActions((next) => {
    if (next) {
      onChanged({ ...a, ...next });
      setEditing(false);
    }
  }, { toastErrors: false });
  const SIcon = SOURCE_ICON[a.source] ?? SOURCE_ICON.manual;
  const ref = sourceRef(a);
  const needsNote = a.status === "pending" && a.needs_contribution_confirmation && note.trim().length < 10;
  const stateText =
    a.status === "confirmed" && a.source === "manual" ? t("achievements2.state.confirmed_manual.d") : t(`achievements2.state.${a.status}.d`);
  const tags = [...new Set([...a.technologies, ...a.skills])];

  const footer = (
    <>
      <Button variant="danger" size="sm" className="me-auto" onClick={() => setAskDelete(true)} disabled={!!actions.busy}>
        <Trash2 /> {t("achievements2.delete")}
      </Button>
      {a.status === "pending" && (
        <>
          <Button variant="secondary" size="sm" loading={actions.busy === "reject"} disabled={!!actions.busy} onClick={() => actions.reject(a)}>
            <X /> {t("achievements2.reject")}
          </Button>
          <Button size="sm" loading={actions.busy === "confirm"} disabled={needsNote || !!actions.busy} onClick={() => actions.confirm(a, note)}>
            <Check /> {t("achievements2.confirm")}
          </Button>
        </>
      )}
      {a.status === "confirmed" && (
        <Button size="sm" loading={actions.busy === "suggest"} disabled={!!actions.busy} onClick={() => actions.suggest(a)}>
          <FileText /> {t("achievements2.cv.suggest")}
        </Button>
      )}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        title={a.title}
        description={
          <span className="flex flex-col gap-1">
            <DecisionStatus a={a} />
            <span className="text-sm text-fg-2">{stateText}</span>
          </span>
        }
        footer={footer}
      >
        <div className="flex flex-col gap-6">
          <DuplicateNotice a={a} />

          <section>
            <SubHeading>{t("achievements2.evidence.title")}</SubHeading>
            <EvidencePanel a={a} />
            {a.status === "pending" && a.source !== "manual" && <ConfidenceText value={a.confidence} className="mt-3 block" />}
          </section>

          <Separator />

          <section>
            <SubHeading
              action={
                !editing && (
                  <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
                    <Pencil /> {t("achievements2.edit")}
                  </Button>
                )
              }
            >
              {t("achievements2.details")}
            </SubHeading>
            {editing ? (
              <EditForm a={a} busy={actions.busy === "save"} onCancel={() => setEditing(false)} onSave={(p) => actions.save(a, p)} />
            ) : (
              <div className="flex flex-col gap-4">
                {a.description && (
                  <p className="text-[15px] leading-relaxed text-fg" dir={isArabic(a.description) ? "rtl" : undefined}>
                    {a.description}
                  </p>
                )}
                <DescriptionList
                  items={[
                    { label: t("achievements2.meta.category"), value: t(`ach.cat.${a.category}`) },
                    {
                      label: t("achievements2.meta.source"),
                      value: (
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <SIcon className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                          <span className="break-all">{t(`achievements2.source.${a.source}`)}</span>
                          {ref && <span className="truncate text-fg-3">· {ref}</span>}
                        </span>
                      ),
                    },
                    { label: t("achievements2.meta.when"), value: a.occurred_on || t("achievements2.meta.none") },
                    { label: t("achievements2.meta.impact"), value: a.impact || t("achievements2.meta.none") },
                    {
                      label: `${t("achievements2.meta.technologies")} / ${t("achievements2.meta.skills")}`,
                      value: tags.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {tags.map((s) => (
                            <Badge key={s} tone="outline">
                              {s}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        t("achievements2.meta.none")
                      ),
                    },
                    { label: t("achievements2.meta.added"), value: <span className="num">{fmtDate(a.created_at, locale)}</span> },
                  ]}
                />
              </div>
            )}
          </section>

          <Separator />

          <section>
            <SubHeading>{t("achievements2.contrib.title")}</SubHeading>
            {a.status === "pending" && a.needs_contribution_confirmation ? (
              <ContributionField a={a} value={note} onChange={setNote} />
            ) : a.contribution_note ? (
              <p className="text-sm leading-relaxed text-fg" dir="auto">
                {a.contribution_note}
              </p>
            ) : (
              <p className="text-sm text-fg-3">{t("achievements2.contrib.none")}</p>
            )}
          </section>

          <Separator />

          <section>
            <SubHeading>{t("achievements2.cv.title")}</SubHeading>
            <p className="text-sm text-fg-2">{a.status === "confirmed" ? t("achievements2.cv.d") : t("achievements2.cv.only_confirmed")}</p>
            <div aria-live="polite" className="mt-3">
              <CvUpdateNotice result={actions.cvResult} />
            </div>
          </section>

          <ErrorNote error={actions.error} />
        </div>

        <ConfirmDialog
          open={askDelete}
          onOpenChange={setAskDelete}
          title={t("achievements2.delete.title")}
          description={fmt(t("achievements2.delete.d"), { t: a.title })}
          confirmLabel={t("achievements2.delete")}
          cancelLabel={t("common.cancel")}
          destructive
          loading={actions.busy === "delete"}
          onConfirm={async () => {
            const ok = await actions.remove(a);
            if (ok) {
              setAskDelete(false);
              onDeleted(a.id);
            }
          }}
        />
      </DrawerContent>
    </Dialog>
  );
}
