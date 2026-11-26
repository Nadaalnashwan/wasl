"use client";

import { Check, Eye, EyeOff, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ErrorNote } from "@/components/feedback";
import { FullPageSpinner, Logo, Toggles } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";
import { Marked } from "@/components/ui/marked";

const DEFAULT_NEXT = "/dashboard";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Open-redirect-safe `next` handling: only same-origin relative paths ("/…", never "//…" or "/\…"),
 * no control characters, and never back to an auth page (which would loop).
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_NEXT;
  if (!raw.startsWith("/") || raw.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_NEXT;
  const path = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (path === "/login" || path === "/register") return DEFAULT_NEXT;
  return raw;
}

/* Read the query string without useSearchParams (keeps the page statically rendered, no Suspense needed). */
const subscribeLocation = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const getSearch = () => window.location.search;
const getServerSearch = () => "";

/** The validated redirect target, read from the live URL at redirect time. */
const currentNext = () => safeNext(new URLSearchParams(window.location.search).get("next"));

type FieldName = "name" | "email" | "password";
type Errors = Partial<Record<FieldName, TKey>>;

function validate(mode: "login" | "register", email: string, password: string): Errors {
  const errs: Errors = {};
  const e = email.trim();
  if (!e) errs.email = "auth2.err.email.required";
  else if (!EMAIL_RE.test(e)) errs.email = "auth2.err.email.invalid";
  if (!password) errs.password = "auth2.err.password.required";
  else if (mode === "register" && password.length < 8) errs.password = "auth2.err.password.short";
  return errs;
}

function StatementPanel() {
  const { t } = useI18n();
  const points: { t: TKey; d: TKey }[] = [
    { t: "auth2.side.p1.t", d: "auth2.side.p1.d" },
    { t: "auth2.side.p2.t", d: "auth2.side.p2.d" },
    { t: "auth2.side.p3.t", d: "auth2.side.p3.d" },
  ];
  return (
    <aside className="hidden border-s border-border bg-primary-soft/60 lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20">
      <div />
      <div className="max-w-md">
        <p className="eyebrow mb-4">{t("auth2.side.eyebrow")}</p>
        <p className="font-display text-[2.5rem] leading-[1.08] text-fg rtl:leading-snug">
          <Marked text={t("auth2.side.title")} mark={t("landing2.hero.mark")} />
        </p>
        <ul className="mt-10 flex flex-col gap-6">
          {points.map((p) => (
            <li key={p.t} className="flex gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text">
                <Check className="size-3" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">{t(p.t)}</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-2">{t(p.d)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-fg-3">{t("auth2.side.foot")}</p>
    </aside>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useI18n();
  const { login, register, user, loading } = useAuth();
  const router = useRouter();
  const search = useSyncExternalStore(subscribeLocation, getSearch, getServerSearch);
  const nextParam = new URLSearchParams(search).get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Already signed in (or just signed in): leave the auth page once the auth state has settled.
  useEffect(() => {
    if (!loading && user && !confirmationEmail) router.replace(currentNext());
  }, [user, loading, router, confirmationEmail]);

  const errors = validate(mode, email, password);
  const show = (f: FieldName) => (submitted || touched[f]) && errors[f];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const errs = validate(mode, email, password);
    if (errs.email || errs.password) {
      (errs.email ? emailRef : passwordRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
        router.replace(currentNext());
      } else {
        const result = await register(email, password, name);
        if (result === "email_confirmation_required") {
          setConfirmationEmail(email.trim());
          return;
        }
        router.replace(currentNext());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    } finally {
      setBusy(false);
    }
  }

  // Signed in and about to be redirected: don't flash the form.
  if (!loading && user && !confirmationEmail) {
    return (
      <>
        <span className="sr-only" role="status">
          {t("auth2.redirecting")}
        </span>
        <FullPageSpinner />
      </>
    );
  }

  const safeNextForLinks = nextParam && safeNext(nextParam) !== DEFAULT_NEXT ? `?next=${encodeURIComponent(safeNext(nextParam))}` : "";
  const altHref = (mode === "login" ? "/register" : "/login") + safeNextForLinks;
  const pwDescribedBy = show("password") ? "password-error" : mode === "register" ? "password-hint" : undefined;

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center gap-3 px-4 py-5 sm:px-8">
          <Logo imageClassName="h-7" />
          <Toggles className="ms-auto" />
        </header>

        <main id="main" className="flex flex-1 items-center justify-center px-4 pt-4 pb-16 sm:px-8">
          <div className="w-full max-w-sm">
            {confirmationEmail ? (
              <section aria-labelledby="confirm-title" className="fade-in" role="status" aria-live="polite">
                <span className="grid size-10 place-items-center rounded-lg bg-primary-soft text-primary-text">
                  <MailCheck className="size-5" aria-hidden />
                </span>
                <h1 id="confirm-title" className="font-display mt-6 text-[2rem] leading-tight text-fg">
                  {t("auth2.confirm.title")}
                </h1>
                <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{t("auth2.confirm.text")}</p>
                <div className="mt-6 rounded-lg border border-border bg-surface px-4 py-3">
                  <div className="text-xs text-fg-3">{t("auth2.confirm.sentTo")}</div>
                  <div className="mt-0.5 text-sm font-medium break-all text-fg" dir="ltr">
                    {confirmationEmail}
                  </div>
                </div>
                <p className="mt-4 text-sm text-fg-3">{t("auth2.confirm.spam")}</p>
                <Button asChild size="lg" className="mt-8 w-full">
                  <Link href={"/login" + safeNextForLinks}>{t("auth2.confirm.back")}</Link>
                </Button>
              </section>
            ) : (
              <form
                onSubmit={submit}
                noValidate
                aria-labelledby="auth-title"
                aria-describedby="auth-sub"
                aria-busy={busy || undefined}
              >
                <h1 id="auth-title" className="font-display text-[2.25rem] leading-tight text-fg">
                  {mode === "login" ? t("auth.login.title") : t("auth.register.title")}
                </h1>
                <p id="auth-sub" className="mt-2 text-[15px] leading-relaxed text-fg-2">
                  {mode === "login" ? t("auth2.login.sub") : t("auth2.register.sub")}
                </p>

                <div className="mt-8 flex flex-col gap-5">
                  {mode === "register" && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="name">{t("auth.name")}</Label>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        className="h-10"
                        aria-describedby="name-hint"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <span id="name-hint" className="text-xs text-fg-3">
                        {t("auth2.name.hint")}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">{t("auth.email")}</Label>
                    <Input
                      ref={emailRef}
                      id="email"
                      name="email"
                      type="email"
                      inputMode="email"
                      autoComplete={mode === "login" ? "username" : "email"}
                      autoCapitalize="none"
                      spellCheck={false}
                      required
                      placeholder={t("auth2.email.placeholder")}
                      dir="ltr"
                      className="h-10 rtl:text-end"
                      aria-invalid={show("email") ? true : undefined}
                      aria-describedby={show("email") ? "email-error" : undefined}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setTouched((s) => ({ ...s, email: true }))}
                    />
                    {show("email") && (
                      <span id="email-error" className="text-xs text-bad">
                        {t(errors.email!)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                    <div className="relative">
                      <Input
                        ref={passwordRef}
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        autoCapitalize="none"
                        spellCheck={false}
                        required
                        minLength={mode === "register" ? 8 : undefined}
                        className="h-10 pe-11"
                        aria-invalid={show("password") ? true : undefined}
                        aria-describedby={pwDescribedBy}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => setTouched((s) => ({ ...s, password: true }))}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-pressed={showPassword}
                        aria-controls="password"
                        aria-label={showPassword ? t("auth2.pw.hide") : t("auth2.pw.show")}
                        title={showPassword ? t("auth2.pw.hide") : t("auth2.pw.show")}
                        className="absolute inset-y-0 end-0 grid w-10 place-items-center rounded-e-lg text-fg-3 transition-colors hover:text-fg"
                      >
                        {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      </button>
                    </div>
                    {show("password") ? (
                      <span id="password-error" className="text-xs text-bad">
                        {t(errors.password!)}
                      </span>
                    ) : (
                      mode === "register" && (
                        <span id="password-hint" className="text-xs text-fg-3">
                          {t("auth.pwhint")}
                        </span>
                      )
                    )}
                  </div>

                  {/* Server / network errors are announced here. */}
                  <div aria-live="assertive" aria-atomic="true">
                    <ErrorNote error={error} />
                  </div>

                  <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
                    {mode === "login" ? t("auth.login") : t("auth.register")}
                  </Button>
                </div>

                <p className="mt-8 text-sm text-fg-2">
                  {mode === "login" ? t("auth.noaccount") : t("auth.haveaccount")}{" "}
                  <Link className="font-medium text-primary-text hover:underline" href={altHref}>
                    {mode === "login" ? t("auth.register") : t("auth.login")}
                  </Link>
                </p>
              </form>
            )}
          </div>
        </main>
      </div>

      <StatementPanel />
    </div>
  );
}
