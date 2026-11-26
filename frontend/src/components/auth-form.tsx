"use client";

import { CheckCircle2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  AuthShell,
  AuthTitle,
  DEFAULT_NEXT,
  EMAIL_RE,
  EmailField,
  FieldError,
  LinkedInButton,
  OrDivider,
  PasswordField,
  PasswordRules,
  passwordRules,
  safeNext,
  useAuthError,
} from "@/components/auth/kit";
import { ErrorNote } from "@/components/feedback";
import { FullPageSpinner } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";

export { safeNext };

/* Read the query string without useSearchParams (keeps the page statically rendered, no Suspense needed). */
const subscribeLocation = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};
const getSearch = () => window.location.search;
const getServerSearch = () => "";

/** The validated redirect target, read from the live URL at redirect time. */
const currentNext = () => safeNext(new URLSearchParams(window.location.search).get("next"));

type FieldName = "email" | "password" | "confirm";
type Errors = Partial<Record<FieldName, TKey>>;

function validate(mode: "login" | "register", email: string, password: string, confirm: string): Errors {
  const errs: Errors = {};
  const e = email.trim();
  if (!e) errs.email = "auth2.err.email.required";
  else if (!EMAIL_RE.test(e)) errs.email = "auth2.err.email.invalid";
  if (!password) errs.password = "auth2.err.password.required";
  else if (mode === "register") {
    const r = passwordRules(password);
    if (!r.length) errs.password = "auth2.err.password.short";
    else if (!r.mix) errs.password = "auth2.err.password.weak";
  }
  if (mode === "register") {
    if (!confirm) errs.confirm = "auth2.err.confirm.required";
    else if (confirm !== password) errs.confirm = "auth2.err.confirm.mismatch";
  }
  return errs;
}

/** "Check your email" after sign-up, with a resend action and the way back to sign-in. */
function ConfirmationSent({ email, backHref }: { email: string; backHref: string }) {
  const { t } = useI18n();
  const { resendConfirmation } = useAuth();
  const translate = useAuthError();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await resendConfirmation(email);
      setSent(true);
    } catch (e) {
      setError(translate(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="confirm-title" className="fade-in">
      <span className="grid size-11 place-items-center rounded-xl bg-primary-soft text-primary-text">
        <MailCheck className="size-5" aria-hidden />
      </span>
      <h1 id="confirm-title" className="font-display mt-6 text-[2rem] leading-tight text-fg">
        {t("auth2.confirm.title")}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{t("auth2.confirm.text")}</p>
      <div className="mt-6 rounded-lg border border-border bg-bg px-4 py-3">
        <div className="text-xs text-fg-3">{t("auth2.confirm.sentTo")}</div>
        <div className="mt-0.5 text-sm font-medium break-all text-fg" dir="ltr">
          {email}
        </div>
      </div>
      <p className="mt-4 text-sm text-fg-3">{t("auth2.confirm.spam")}</p>
      <div aria-live="polite" className="mt-4 empty:hidden">
        {sent && (
          <p className="inline-flex items-center gap-2 text-sm font-medium text-ok">
            <CheckCircle2 className="size-4" aria-hidden /> {t("auth2.confirm.resent")}
          </p>
        )}
        <ErrorNote error={error} />
      </div>
      <div className="mt-8 flex flex-col gap-3">
        <Button asChild size="lg" className="w-full">
          <Link href={backHref}>{t("auth2.confirm.back")}</Link>
        </Button>
        <Button type="button" variant="ghost" size="lg" className="w-full" loading={busy} onClick={resend}>
          {t("auth2.confirm.resend")}
        </Button>
      </div>
    </section>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useI18n();
  const { login, register, user, loading, mode: authMode, providers, signInWithLinkedIn, resendConfirmation } = useAuth();
  const translate = useAuthError();
  const router = useRouter();
  const search = useSyncExternalStore(subscribeLocation, getSearch, getServerSearch);
  const params = new URLSearchParams(search);
  const nextParam = params.get("next");
  const notice: TKey | null = mode === "login" ? (params.get("reset") ? "auth2.notice.reset" : params.get("verified") ? "auth2.notice.verified" : null) : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [liBusy, setLiBusy] = useState(false);
  const [liError, setLiError] = useState<ApiError | null>(null);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Already signed in (or just signed in): leave the auth page once the auth state has settled.
  useEffect(() => {
    if (!loading && user && !confirmationEmail) router.replace(currentNext());
  }, [user, loading, router, confirmationEmail]);

  const errors = validate(mode, email, password, confirm);
  const show = (f: FieldName) => (submitted || touched[f]) && errors[f];
  const touch = (f: FieldName) => () => setTouched((s) => ({ ...s, [f]: true }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const errs = validate(mode, email, password, confirm);
    if (errs.email || errs.password || errs.confirm) {
      (errs.email ? emailRef : errs.password ? passwordRef : confirmRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    setResent(false);
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
      if (err instanceof ApiError && err.code === "auth:email_not_confirmed") setUnconfirmed(true);
      setError(translate(err));
    } finally {
      setBusy(false);
    }
  }

  async function resendFromLogin() {
    try {
      await resendConfirmation(email);
      setResent(true);
      setError(null);
    } catch (err) {
      setError(translate(err));
    }
  }

  async function linkedIn() {
    setLiBusy(true);
    setLiError(null);
    try {
      await signInWithLinkedIn(currentNext());
      // The browser is now navigating to LinkedIn; keep the busy state.
    } catch (err) {
      setLiError(translate(err));
      setLiBusy(false);
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

  const nextQuery = nextParam && safeNext(nextParam) !== DEFAULT_NEXT ? `?next=${encodeURIComponent(safeNext(nextParam))}` : "";
  const altHref = (mode === "login" ? "/register" : "/login") + nextQuery;
  const supabaseMode = authMode === "supabase";

  return (
    <AuthShell>
      {confirmationEmail ? (
        <ConfirmationSent email={confirmationEmail} backHref={"/login" + nextQuery} />
      ) : (
        <>
          <form onSubmit={submit} noValidate aria-labelledby="auth-title" aria-busy={busy || undefined}>
            <AuthTitle
              id="auth-title"
              title={mode === "login" ? t("auth.login.title") : t("auth.register.title")}
              sub={mode === "login" ? t("auth2.login.sub") : t("auth2.register.sub")}
            />

            {notice && (
              <p role="status" className="mt-6 flex items-start gap-2 rounded-lg border border-ok/30 bg-ok-soft px-3.5 py-2.5 text-sm text-fg">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                {t(notice)}
              </p>
            )}

            <div className="mt-7 flex flex-col gap-5">
              {mode === "register" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="name">{t("auth.name")}</Label>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    className="h-11"
                    aria-describedby="name-hint"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <span id="name-hint" className="text-xs text-fg-3">
                    {t("auth2.name.hint")}
                  </span>
                </div>
              )}

              <EmailField
                ref={emailRef}
                value={email}
                onChange={setEmail}
                onBlur={touch("email")}
                autoComplete={mode === "login" ? "username" : "email"}
                error={show("email") ? t(errors.email!) : undefined}
              />

              <div className="flex flex-col gap-1.5">
                <PasswordField
                  ref={passwordRef}
                  id="password"
                  label={t("auth.password")}
                  value={password}
                  onChange={setPassword}
                  onBlur={touch("password")}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  invalid={Boolean(show("password"))}
                  describedBy={show("password") ? "password-error" : mode === "register" ? "password-rules" : undefined}
                  labelAside={
                    mode === "login" && supabaseMode ? (
                      <Link href="/forgot-password" className="text-sm font-medium text-primary-text hover:underline">
                        {t("auth2.forgot.link")}
                      </Link>
                    ) : undefined
                  }
                />
                {show("password") && <FieldError id="password-error">{t(errors.password!)}</FieldError>}
              </div>

              {mode === "register" && (
                <div className="flex flex-col gap-1.5">
                  <PasswordField
                    ref={confirmRef}
                    id="confirm"
                    label={t("auth2.confirmpw")}
                    value={confirm}
                    onChange={setConfirm}
                    onBlur={touch("confirm")}
                    autoComplete="new-password"
                    invalid={Boolean(show("confirm"))}
                    describedBy={show("confirm") ? "confirm-error" : "password-rules"}
                  />
                  {show("confirm") && <FieldError id="confirm-error">{t(errors.confirm!)}</FieldError>}
                  <PasswordRules id="password-rules" password={password} confirm={confirm} />
                </div>
              )}

              {/* Server / network errors are announced here. */}
              <div aria-live="assertive" aria-atomic="true" className="flex flex-col gap-2 empty:hidden">
                <ErrorNote error={error} />
                {unconfirmed && !resent && (
                  <button type="button" onClick={resendFromLogin} className="w-fit text-sm font-medium text-primary-text hover:underline">
                    {t("auth2.unconfirmed.resend")}
                  </button>
                )}
                {resent && (
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-ok">
                    <CheckCircle2 className="size-4" aria-hidden /> {t("auth2.confirm.resent")}
                  </p>
                )}
              </div>

              <Button type="submit" size="lg" loading={busy} className="mt-1 w-full">
                {mode === "login" ? t("auth.login") : t("auth.register")}
              </Button>
            </div>
          </form>

          {supabaseMode && (
            <>
              <OrDivider />
              <LinkedInButton enabled={providers ? providers.linkedin : null} busy={liBusy} error={liError} onClick={linkedIn} />
            </>
          )}

          <p className="mt-8 text-sm text-fg-2">
            {mode === "login" ? t("auth.noaccount") : t("auth.haveaccount")}{" "}
            <Link className="font-semibold text-primary-text hover:underline" href={altHref}>
              {mode === "login" ? t("auth.register") : t("auth.login")}
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
}
