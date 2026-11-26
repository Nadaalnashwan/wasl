"use client";

import { Database, KeyRound, Languages, Link2, ShieldCheck, Sparkles, User } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/** "{p} connected" style placeholders. */
export function fill(s: string, vars: Record<string, string | number>) {
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

const PROVIDER_NAMES: Record<string, string> = {
  groq: "Groq",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
  openai: "OpenAI",
  anthropic: "Anthropic",
  mistral: "Mistral",
  fake: "Test provider",
  linkedin: "LinkedIn",
  github: "GitHub",
};

export function providerName(id: string) {
  return PROVIDER_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export type AiKey = { provider: string; hint: string; status: "valid" | "invalid" | string; validated_at: string | null; created_at: string };
export type AiMode = "platform" | "personal" | "personal_first";
export type AiSettings = {
  ai_mode: AiMode;
  allow_platform_fallback: boolean;
  allow_cross_provider: boolean;
  platform_providers: string[];
  byok_providers: string[];
  keys: AiKey[];
};

const SECTION_ICONS: Record<string, React.ElementType> = {
  profile: User,
  account: KeyRound,
  appearance: Languages,
  integrations: Link2,
  ai: Sparkles,
  keys: KeyRound,
  privacy: ShieldCheck,
  data: Database,
};

/** One settings area as a v1 card: an outlined sky icon square and the title, the explanation, then the controls. */
export function SettingsSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const hid = `${id}-title`;
  const Icon = SECTION_ICONS[id] ?? Sparkles;
  return (
    <section id={id} aria-labelledby={hid} className={cn("ink-card min-w-0 scroll-mt-24 p-5 sm:p-6", className)}>
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] border-[1.5px] border-ink bg-primary-soft text-fg" aria-hidden>
          <Icon className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={hid} className="font-display text-xl leading-tight text-fg">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-fg-3">{description}</p>}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** A labelled row inside a bordered group: label/description on the start, control on the end. */
export function SettingRow({
  label,
  description,
  control,
  children,
  className,
  labelId,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  labelId?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:gap-6", className)}>
      <div className="min-w-0 flex-1">
        <div id={labelId} className="text-sm font-medium text-fg">
          {label}
        </div>
        {description && <div className="mt-0.5 text-sm text-fg-3">{description}</div>}
        {children}
      </div>
      {control && <div className="flex shrink-0 flex-wrap items-center gap-2">{control}</div>}
    </div>
  );
}

/** Bordered group of rows separated by hairlines. */
export function RowGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("ink-soft divide-y divide-border-soft", className)}>{children}</div>;
}
