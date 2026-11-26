"use client";

/* Shared pieces for every auth screen: page shell, fields, error translation, LinkedIn button. */

import { Check, Eye, EyeOff } from "lucide-react";
import { forwardRef, useState } from "react";
import { LinkedinIcon } from "@/components/brand-icons";
import { StationArt } from "@/components/brand/art";
import { ErrorNote } from "@/components/feedback";
import { Logo, Toggles } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { Marked } from "@/components/ui/marked";
import { ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const DEFAULT_NEXT = "/dashboard";
const AUTH_PAGES = new Set(["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"]);

/**
 * Open-redirect-safe `next` handling: only same-origin relative paths ("/…", never "//…" or "/\…"),
 * no control characters, and never back to an auth page (which would loop).
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_NEXT;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (AUTH_PAGES.has(path)) return DEFAULT_NEXT;
  return raw;
}

/** Password policy shown live while typing (the server enforces its own minimum as well). */
export function passwordRules(pw: string) {
  return { length: pw.length >= 8, mix: /[A-Za-z؀-ۿ]/.test(pw) && /[^A-Za-z؀-ۿ]/.test(pw) };
}

/** Translate a Supabase Auth error code (carried as ApiError.code "auth:<code>") into the interface language. */
export function useAuthError() {
  const { t } = useI18n();
  return (err: unknown): ApiError => {
    if (err instanceof ApiError) {
      const code = err.code?.startsWith("auth:") ? err.code.slice(5) : null;
      const wait = err.message.match(/after (\d+) seconds?/);
      if (wait) return new ApiError(err.status, fmt(t("auth2.code.wait_seconds"), { n: wait[1] }), err.detail, err.code);
      const key = code ? (`auth2.code.${code}` as TKey) : null;
      if (key && t(key) !== key) return new ApiError(err.status, t(key), err.detail, err.code);
      if (err.status === 0 || /fetch|network/i.test(err.message)) return new ApiError(0, t("auth2.code.network"));
      return err;
    }
    const msg = String((err as Error)?.message ?? err);
    if (/fetch|network/i.test(msg)) return new ApiError(0, t("auth2.code.network"));
    return new ApiError(0, msg);
  };
}

/** v1: the intake arm and the promise on the start side of the page (no panel, on paper). */
function SidePanel() {
  const { t } = useI18n();
  const points: { t: TKey; d: TKey }[] = [
    { t: "auth2.side.p1.t", d: "auth2.side.p1.d" },
    { t: "auth2.side.p2.t", d: "auth2.side.p2.d" },
    { t: "auth2.side.p3.t", d: "auth2.side.p3.d" },
  ];
  return (
    <aside className="hidden min-w-0 lg:block">
      <StationArt kind="document" className="mb-8 h-36 w-auto" />
      <p className="mb-3 text-sm font-bold text-primary-text">{t("auth2.side.eyebrow")}</p>
      <p className="font-display max-w-md text-[2.3rem] leading-[1.1] text-fg rtl:leading-snug">
        <Marked text={t("auth2.side.title")} mark={t("landing2.hero.mark")} />
      </p>
      <ul className="mt-9 flex max-w-md flex-col gap-5">
        {points.map((p) => (
          <li key={p.t} className="flex gap-3">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] border-ink bg-primary-soft text-fg">
              <Check className="size-3" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold text-fg">{t(p.t)}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-fg-2">{t(p.d)}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-xs text-fg-3">{t("auth2.side.foot")}</p>
    </aside>
  );
}

/** v1's auth layout: logo and pills across the top; the arm and promise on the start side, the form card on the end side. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-5 sm:px-6 lg:px-8">
        <Logo imageClassName="h-8" />
        <Toggles className="ms-auto" />
      </header>
      <main id="main" className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-4 pt-4 pb-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:px-8">
        <SidePanel />
        <div className="ink-card mx-auto w-full max-w-[27rem] px-6 py-8 sm:px-9 sm:py-10 lg:mx-0">{children}</div>
      </main>
    </div>
  );
}

export function AuthTitle({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <>
      <h1 id={id} className="font-display text-[2rem] leading-tight text-fg">
        {title}
      </h1>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{sub}</p>}
    </>
  );
}

export function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-xs font-medium text-bad">
      {children}
    </span>
  );
}

type PwProps = {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  describedBy?: string;
  labelAside?: React.ReactNode;
};

/** Password input with a show/hide toggle (the toggle never submits and keeps focus order). */
export const PasswordField = forwardRef<HTMLInputElement, PwProps>(function PasswordField(
  { id, label, value, onChange, onBlur, autoComplete, invalid, describedBy, labelAside },
  ref,
) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        {labelAside}
      </div>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          name={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          required
          className="h-11 pe-11"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-pressed={show}
          aria-controls={id}
          aria-label={show ? t("auth2.pw.hide") : t("auth2.pw.show")}
          title={show ? t("auth2.pw.hide") : t("auth2.pw.show")}
          className="absolute inset-y-0 end-0 grid w-11 place-items-center rounded-e-lg text-fg-3 transition-colors hover:text-fg"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
});

export const EmailField = forwardRef<
  HTMLInputElement,
  { value: string; onChange: (v: string) => void; onBlur?: () => void; error?: string; autoComplete?: string }
>(function EmailField({ value, onChange, onBlur, error, autoComplete = "email" }, ref) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="email">{t("auth.email")}</Label>
      <Input
        ref={ref}
        id="email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        placeholder={t("auth2.email.placeholder")}
        dir="ltr"
        className="h-11 rtl:text-end"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "email-error" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      {error && <FieldError id="email-error">{error}</FieldError>}
    </div>
  );
});

/** Live checklist for a new password; each rule is announced as met / not met. */
export function PasswordRules({ password, confirm, id }: { password: string; confirm?: string; id: string }) {
  const { t } = useI18n();
  const r = passwordRules(password);
  const items: [boolean, TKey][] = [
    [r.length, "auth2.pwrule.length"],
    [r.mix, "auth2.pwrule.mix"],
  ];
  if (confirm !== undefined) items.push([confirm.length > 0 && confirm === password, "auth2.pwrule.match"]);
  return (
    <ul id={id} className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map(([ok, k]) => (
        <li key={k} className={cn("inline-flex items-center gap-1.5", ok ? "text-ok" : "text-fg-3")}>
          <span className={cn("grid size-3.5 place-items-center rounded-full border", ok ? "border-ok bg-ok text-on-primary" : "border-border")} aria-hidden>
            {ok && <Check className="size-2.5" strokeWidth={3} />}
          </span>
          {t(k)}
          <span className="sr-only">{ok ? " ✓" : ""}</span>
        </li>
      ))}
    </ul>
  );
}

export function OrDivider() {
  const { t } = useI18n();
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-semibold tracking-wide text-fg-3 uppercase" role="separator">
      <span className="h-px flex-1 bg-border" />
      {t("auth2.or")}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * Real "Sign in with LinkedIn (OpenID Connect)" through Supabase Auth. Shown only when the project has the
 * linkedin_oidc provider enabled; otherwise a disabled button explains why, so the UI never fakes a login.
 */
export function LinkedInButton({
  enabled,
  onClick,
  busy,
  error,
}: {
  enabled: boolean | null;
  onClick: () => void;
  busy: boolean;
  error: ApiError | null;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={enabled !== true}
        loading={busy}
        aria-describedby={enabled === false ? "linkedin-off" : undefined}
        onClick={onClick}
      >
        <LinkedinIcon className="size-[18px]" />
        {busy ? t("auth2.linkedin.redirecting") : t("auth2.linkedin")}
      </Button>
      {enabled === false && (
        <p id="linkedin-off" className="text-center text-xs text-fg-3">
          {t("auth2.linkedin.off")}
        </p>
      )}
      <div aria-live="assertive">
        <ErrorNote error={error} />
      </div>
    </div>
  );
}
