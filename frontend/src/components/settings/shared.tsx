"use client";

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

/** One settings section: heading + explanation, then its controls. Sections are separated by hairlines. */
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
  return (
    <section
      id={id}
      aria-labelledby={hid}
      className={cn(
        "scroll-mt-24 border-t border-border py-9 first:border-t-0 first:pt-0",
        className,
      )}
    >
      <div className="mb-5 max-w-2xl">
        <h2 id={hid} className="text-heading font-semibold text-fg">
          {title}
        </h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-fg-3">{description}</p>}
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
  return <div className={cn("divide-y divide-border rounded-xl border border-border bg-surface shadow-sm", className)}>{children}</div>;
}
