"use client";

/* Forgot password → e-mail → reset password, and the landing page for e-mail confirmation and OAuth returns. */

import { KeyRound, Link2Off, MailCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AuthShell,
  AuthTitle,
  EMAIL_RE,
  EmailField,
  FieldError,
  PasswordField,
  PasswordRules,
  passwordRules,
  safeNext,
  useAuthError,
} from "@/components/auth/kit";
import { ErrorNote } from "@/components/feedback";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { useI18n, type TKey } from "@/lib/i18n";
import { getInitialAuthRedirect, getSupabase, useAuth } from "@/lib/providers";

function Spinner({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-4 py-10 text-center">
      <span className="size-8 animate-spin rounded-full border-2 border-primary/25 border-t-primary" aria-hidden />
      <p className="text-sm text-fg-2">{label}</p>
    </div>
  );
}

function IconBadge({ children, tone = "primary" }: { children: React.ReactNode; tone?: "primary" | "bad" | "ok" }) {
  const cls = tone === "bad" ? "bg-bad-soft text-bad" : tone === "ok" ? "bg-ok-soft text-ok" : "bg-primary-soft text-primary-text";
  return <span className={`grid size-11 place-items-center rounded-xl ${cls}`}>{children}</span>;
}

/* ------------------------------------------------------------------ forgot password */

export function ForgotPassword() {
  const { t } = useI18n();
  const { mode, requestPasswordReset } = useAuth();
  const translate = useAuthError();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const e = email.trim();
  const fieldErr: TKey | null = !e ? "auth2.err.email.required" : !EMAIL_RE.test(e) ? "auth2.err.email.invalid" : null;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitted(true);
    if (fieldErr) {
      emailRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(e);
      setSentTo(e);
    } catch (err) {
      setError(translate(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell>
        <section aria-labelledby="sent-title" className="fade-in" role="status">
          <IconBadge>
            <MailCheck className="size-5" aria-hidden />
          </IconBadge>
          <h1 id="sent-title" className="font-display mt-6 text-[2rem] leading-tight text-fg">
            {t("auth2.forgot.sent.title")}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{t("auth2.forgot.sent.text")}</p>
          <div className="mt-6 rounded-lg border border-border bg-bg px-4 py-3">
            <div className="text-xs text-fg-3">{t("auth2.confirm.sentTo")}</div>
            <div className="mt-0.5 text-sm font-medium break-all text-fg" dir="ltr">
              {sentTo}
            </div>
          </div>
          <p className="mt-4 text-sm text-fg-3">{t("auth2.confirm.spam")}</p>
          <div className="mt-8 flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/login">{t("auth2.back.login")}</Link>
            </Button>
            <Button type="button" variant="ghost" size="lg" className="w-full" onClick={() => setSentTo(null)}>
              {t("auth2.forgot.again")}
            </Button>
          </div>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <form onSubmit={submit} noValidate aria-labelledby="forgot-title" aria-busy={busy || undefined}>
        <IconBadge>
          <KeyRound className="size-5" aria-hidden />
        </IconBadge>
        <div className="mt-6">
          <AuthTitle id="forgot-title" title={t("auth2.forgot.title")} sub={t("auth2.forgot.sub")} />
        </div>
        {mode !== "supabase" ? (
          <p className="mt-7 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-fg">{t("auth2.unavailable.local")}</p>
        ) : (
          <div className="mt-7 flex flex-col gap-5">
            <EmailField
              ref={emailRef}
              value={email}
              onChange={setEmail}
              onBlur={() => setTouched(true)}
              autoComplete="email"
              error={(submitted || touched) && fieldErr ? t(fieldErr) : undefined}
            />
            <div aria-live="assertive" className="empty:hidden">
              <ErrorNote error={error} />
            </div>
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {t("auth2.forgot.submit")}
            </Button>
          </div>
        )}
        <p className="mt-8 text-sm">
          <Link href="/login" className="font-semibold text-primary-text hover:underline">
            ← {t("auth2.back.login")}
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ reset password */

type ResetState = "checking" | "ready" | "invalid";

export function ResetPassword() {
  const { t } = useI18n();
  const { updatePassword, logout } = useAuth();
  const translate = useAuthError();
  const router = useRouter();
  const [state, setState] = useState<ResetState>("checking");
  const [invalidReason, setInvalidReason] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // A reset form is offered only for a real recovery session opened from the e-mailed link.
  useEffect(() => {
    const client = getSupabase();
    const redirect = getInitialAuthRedirect();
    let settled = false;
    const done = (s: ResetState, reason?: string | null) => {
      if (settled) return;
      settled = true;
      setState(s);
      setInvalidReason(reason ?? null);
    };
    if (!client) return done("invalid");
    if (redirect.errorCode) {
      const key = `auth2.code.${redirect.errorCode}` as TKey;
      return done("invalid", t(key) !== key ? t(key) : redirect.errorDescription);
    }
    const sub = client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") done("ready");
    });
    void (async () => {
      if (redirect.code) await client.auth.exchangeCodeForSession(redirect.code).catch(() => null);
      const { data } = await client.auth.getSession();
      if (data.session && redirect.type === "recovery") done("ready");
      else if (data.session && redirect.code) done("ready");
      else window.setTimeout(() => done("invalid"), 1500);
    })();
    return () => sub.data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the link this page was opened with
  }, []);

  const rules = passwordRules(password);
  const pwErr: TKey | null = !password ? "auth2.err.password.required" : !rules.length ? "auth2.err.password.short" : !rules.mix ? "auth2.err.password.weak" : null;
  const cfErr: TKey | null = !confirm ? "auth2.err.confirm.required" : confirm !== password ? "auth2.err.confirm.mismatch" : null;

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setSubmitted(true);
    if (pwErr || cfErr) {
      (pwErr ? pwRef : confirmRef).current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      // Close the recovery session so the user signs in deliberately with the new password.
      await logout().catch(() => undefined);
      router.replace("/login?reset=1");
    } catch (err) {
      const e = translate(err);
      if (err instanceof ApiError && (err.code === "auth:session_not_found" || err.status === 401)) {
        setState("invalid");
        setInvalidReason(e.message);
      } else setError(e);
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      {state === "checking" && <Spinner label={t("auth2.reset.checking")} />}

      {state === "invalid" && (
        <section aria-labelledby="invalid-title" role="alert" className="fade-in">
          <IconBadge tone="bad">
            <Link2Off className="size-5" aria-hidden />
          </IconBadge>
          <h1 id="invalid-title" className="font-display mt-6 text-[2rem] leading-tight text-fg">
            {t("auth2.reset.invalid.title")}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{invalidReason || t("auth2.reset.invalid.text")}</p>
          {invalidReason && <p className="mt-2 text-sm text-fg-3">{t("auth2.reset.invalid.text")}</p>}
          <div className="mt-8 flex flex-col gap-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/forgot-password">{t("auth2.reset.request")}</Link>
            </Button>
            <Button asChild variant="ghost" size="lg" className="w-full">
              <Link href="/login">{t("auth2.back.login")}</Link>
            </Button>
          </div>
        </section>
      )}

      {state === "ready" && (
        <form onSubmit={submit} noValidate aria-labelledby="reset-title" aria-busy={busy || undefined} className="fade-in">
          <IconBadge>
            <KeyRound className="size-5" aria-hidden />
          </IconBadge>
          <div className="mt-6">
            <AuthTitle id="reset-title" title={t("auth2.reset.title")} sub={t("auth2.reset.sub")} />
          </div>
          <div className="mt-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <PasswordField
                ref={pwRef}
                id="new-password"
                label={t("auth2.reset.new")}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                invalid={submitted && Boolean(pwErr)}
                describedBy={submitted && pwErr ? "new-password-error" : "reset-rules"}
              />
              {submitted && pwErr && <FieldError id="new-password-error">{t(pwErr)}</FieldError>}
            </div>
            <div className="flex flex-col gap-1.5">
              <PasswordField
                ref={confirmRef}
                id="confirm-password"
                label={t("auth2.confirmpw")}
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                invalid={submitted && Boolean(cfErr)}
                describedBy={submitted && cfErr ? "confirm-password-error" : "reset-rules"}
              />
              {submitted && cfErr && <FieldError id="confirm-password-error">{t(cfErr)}</FieldError>}
              <PasswordRules id="reset-rules" password={password} confirm={confirm} />
            </div>
            <div aria-live="assertive" className="empty:hidden">
              <ErrorNote error={error} />
            </div>
            <Button type="submit" size="lg" loading={busy} className="w-full">
              {t("auth2.reset.submit")}
            </Button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

/* ------------------------------------------------------------------ e-mail confirmation / OAuth return */

export function AuthCallback() {
  const { t } = useI18n();
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabase();
    const redirect = getInitialAuthRedirect();
    const next = safeNext(new URLSearchParams(window.location.search).get("next"));
    if (!client) {
      router.replace("/login");
      return;
    }
    if (redirect.errorCode) {
      const key = `auth2.code.${redirect.errorCode}` as TKey;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the one-time redirect result
      setFailed(t(key) !== key ? t(key) : redirect.errorDescription || t("auth2.callback.failed.text"));
      return;
    }
    let cancelled = false;
    void (async () => {
      if (redirect.code) {
        const { error } = await client.auth.exchangeCodeForSession(redirect.code);
        if (error && !cancelled) {
          setFailed(error.message);
          return;
        }
      }
      const { data } = await client.auth.getSession();
      if (cancelled) return;
      if (data.session) router.replace(next);
      else if (redirect.type === "signup" || redirect.type === "email") router.replace("/login?verified=1");
      else setFailed(t("auth2.callback.failed.text"));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the redirect this page was opened with
  }, []);

  return (
    <AuthShell>
      {failed ? (
        <section aria-labelledby="cb-title" role="alert" className="fade-in">
          <IconBadge tone="bad">
            <Link2Off className="size-5" aria-hidden />
          </IconBadge>
          <h1 id="cb-title" className="font-display mt-6 text-[2rem] leading-tight text-fg">
            {t("auth2.callback.failed.title")}
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{failed}</p>
          <Button asChild size="lg" className="mt-8 w-full">
            <Link href="/login">{t("auth2.back.login")}</Link>
          </Button>
        </section>
      ) : (
        <Spinner label={t("auth2.callback.working")} />
      )}
    </AuthShell>
  );
}
