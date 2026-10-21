"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNote } from "@/components/feedback";
import { Logo, Toggles } from "@/components/shell/app-shell";
import { ClawArt } from "@/components/sketch/illustrations";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { ApiError } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/providers";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { t } = useI18n();
  const { login, register, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  const next = () => {
    const n = new URLSearchParams(window.location.search).get("next");
    return n && n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
  };

  useEffect(() => {
    if (user && !confirmationEmail) router.replace(next());
  }, [user, router, confirmationEmail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(email, password);
        router.replace(next());
      } else {
        const result = await register(email, password, name);
        if (result === "email_confirmation_required") {
          setConfirmationEmail(email.trim());
          return;
        }
        router.replace(next());
      }
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, String(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center px-4 py-5">
        <Logo />
        <Toggles className="ms-auto" />
      </header>
      <div className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-4 pb-16 md:grid-cols-2">
        <div className="hidden flex-col items-center gap-4 md:flex">
          <ClawArt className="bob h-64 w-auto" />
          <p className="max-w-xs text-center font-hand text-2xl text-ink-soft">{t("brand.tagline")}</p>
        </div>
        {confirmationEmail ? (
          <section className="sketch flex flex-col items-center gap-5 p-7 text-center" role="status" aria-live="polite">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#173d67] text-4xl" aria-hidden="true">✉️</div>
            <h1 className="font-hand text-4xl">Check Your Email!</h1>
            <p className="text-ink-soft">
              Your registration request was received. If confirmation is required,
              check your inbox for a verification link before signing in.
            </p>
            <p className="w-full break-all rounded-xl bg-[#173d67] px-4 py-3 text-sm font-semibold text-white">
              {confirmationEmail}
            </p>
            <p className="text-sm text-ink-soft">Can't find it? Check your spam or junk folder.</p>
            <Link href="/login" className="inline-flex w-full items-center justify-center rounded-xl bg-[#4aa9ff] px-5 py-3 font-bold text-[#07192c]">
              Back to Sign In →
            </Link>
          </section>
        ) : (
          <form onSubmit={submit} className="sketch flex flex-col gap-5 p-7" noValidate>
            <h1 className="font-hand text-4xl">{mode === "login" ? t("auth.login.title") : t("auth.register.title")}</h1>
            {mode === "register" && (
              <Field label={t("auth.name")} htmlFor="name">
                <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
            )}
            <Field label={t("auth.email")} htmlFor="email">
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label={t("auth.password")} htmlFor="password" hint={mode === "register" ? t("auth.pwhint") : undefined}>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <ErrorNote error={error} />
            <Button type="submit" size="lg" loading={busy} disabled={!email || password.length < (mode === "register" ? 8 : 1)}>
              {mode === "login" ? t("auth.login") : t("auth.register")}
            </Button>
            <p className="text-center text-sm text-ink-soft">
              {mode === "login" ? t("auth.noaccount") : t("auth.haveaccount")}{" "}
              <Link className="font-bold text-brand underline" href={mode === "login" ? "/register" : "/login"}>
                {mode === "login" ? t("auth.register") : t("auth.login")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
