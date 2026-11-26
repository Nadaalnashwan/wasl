
"use client";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, ApiError, configureApi } from "./api";
import { I18nProvider } from "./i18n";
import type { User } from "./types";

/* ------------------------------------------------------------------ theme */

type Theme = "light" | "dark";

const ThemeContext = createContext<{
  theme: Theme;
  toggle: () => void;
}>({
  theme: "light",
  toggle: () => {},
});

function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let initial: Theme = "light";

    try {
      const saved = localStorage.getItem("wasl.theme");

      if (saved === "dark" || saved === "light") {
        initial = saved;
      } else if (
        window.matchMedia("(prefers-color-scheme: dark)").matches
      ) {
        initial = "dark";
      }
    } catch {
      // Continue with the default theme.
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";

      try {
        localStorage.setItem("wasl.theme", next);
      } catch {
        // The theme still works for the current session.
      }

      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

/* ------------------------------------------------------------------ auth */

/** Issue (token) or clear (null) the HttpOnly admin session cookie via the Next route handler. */
export async function syncAdminSession(token: string | null) {
  try {
    await fetch("/api/admin-session", {
      method: token ? "POST" : "DELETE",
      headers: token ? { "Content-Type": "application/json" } : undefined,
      body: token ? JSON.stringify({ token }) : undefined,
      credentials: "same-origin",
    });
  } catch {
    // best effort: the /admin gate will retry
  }
}

const AUTH_MODE =
  process.env.NEXT_PUBLIC_AUTH_MODE === "supabase"
    ? "supabase"
    : "local";

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";

const SUPA_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

/**
 * What the auth redirect said when this page loaded (e-mail confirmation, password recovery, OAuth return).
 * Captured before the Supabase client consumes and strips the URL hash, so auth pages can tell a real
 * recovery link from a plain visit, and show "expired / invalid link" errors instead of failing silently.
 */
export type AuthRedirect = { type: string | null; errorCode: string | null; errorDescription: string | null; code: string | null };
const initialRedirect: AuthRedirect = (() => {
  if (typeof window === "undefined") return { type: null, errorCode: null, errorDescription: null, code: null };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const pick = (k: string) => hash.get(k) ?? query.get(k);
  return {
    type: pick("type"),
    errorCode: pick("error_code") ?? pick("error"),
    errorDescription: pick("error_description"),
    code: query.get("code"),
  };
})();
export function getInitialAuthRedirect(): AuthRedirect {
  return initialRedirect;
}

const supabase: SupabaseClient | null =
  AUTH_MODE === "supabase" && SUPA_URL && SUPA_ANON
    ? createClient(SUPA_URL, SUPA_ANON)
    : null;

type RegisterResult =
  | "email_confirmation_required"
  | "signed_in";

/** The Supabase browser client (null in local auth mode). Auth pages use it to observe recovery / OAuth sessions. */
export function getSupabase(): SupabaseClient | null {
  return supabase;
}

/**
 * Supabase Auth error codes are stable identifiers; the UI translates them (see auth locale "auth2.code.*").
 * The raw message is kept as the fallback text so nothing is lost when a new code appears.
 */
function authError(status: number, error: { message: string; code?: string; status?: number }): ApiError {
  return new ApiError(error.status ?? status, error.message, undefined, error.code ? `auth:${error.code}` : undefined);
}

/** Absolute URL on this site, used as the e-mail / OAuth return address (must be in Supabase's redirect allow-list). */
function siteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

export type AuthProviders = { linkedin: boolean; emailRecovery: boolean };

type AuthCtx = {
  user: User | null;
  loading: boolean;
  mode: "local" | "supabase";
  login: (
    email: string,
    password: string
  ) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string
  ) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  /** Which optional sign-in methods this deployment really supports (read from Supabase Auth settings). */
  providers: AuthProviders | null;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  signInWithLinkedIn: (next: string) => Promise<void>;
};

const AuthContext = createContext<AuthCtx | null>(null);

const TOKEN_KEY = "wasl.token";

function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const requireSupabase = useCallback((): SupabaseClient => {
    if (!supabase) {
      throw new ApiError(
        500,
        "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and your public key in frontend/.env."
      );
    }

    return supabase;
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (AUTH_MODE === "supabase") {
      const client = requireSupabase();

      const {
        data: { session },
        error,
      } = await client.auth.getSession();

      if (error) {
        throw new ApiError(401, error.message);
      }

      return session?.access_token ?? null;
    }

    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }, [requireSupabase]);

  const clear = useCallback(() => {
    if (AUTH_MODE === "local") {
      try {
        localStorage.removeItem(TOKEN_KEY);
      } catch {
        // Local storage may be unavailable.
      }
    }

    setUser(null);
    void syncAdminSession(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const token = await getToken();

      if (!token) {
        setUser(null);
        return;
      }

      const currentUser = await api<User>("/api/auth/me");
      setUser(currentUser);
      // Admins get an HttpOnly session cookie the /admin proxy can verify server-side. The role is checked by the
      // backend inside the route handler — this call is a convenience, not the security boundary.
      if (currentUser.role === "admin") void syncAdminSession(token);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        clear();
      } else {
        console.error(
          "Failed to load the Wasl user profile:",
          error
        );
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, clear]);

  useEffect(() => {
    configureApi(getToken, clear);

    // Restore the existing session when the app loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session restore syncs with external auth storage
    void refresh();

    if (AUTH_MODE !== "supabase" || !supabase) {
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clear();
        return;
      }

      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        // Avoid calling Supabase methods inside its auth callback.
        queueMicrotask(() => {
          void refresh();
        });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [getToken, clear, refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      if (AUTH_MODE === "supabase") {
        const client = requireSupabase();

        const { error } =
          await client.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) {
          throw authError(401, error);
        }
      } else {
        const result = await api<{
          access_token: string;
          user: User;
        }>("/api/auth/login", {
          method: "POST",
          json: {
            email: email.trim(),
            password,
          },
        });

        try {
          localStorage.setItem(
            TOKEN_KEY,
            result.access_token
          );
        } catch {
          throw new ApiError(
            500,
            "Unable to save your login session."
          );
        }
      }

      await refresh();
    },
    [requireSupabase, refresh],
  );

  const register = useCallback(
    async (
      email: string,
      password: string,
      fullName: string
    ): Promise<RegisterResult> => {
      if (AUTH_MODE === "supabase") {
        const client = requireSupabase();

        const { data, error } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            },
            // The confirmation link returns here; /auth/callback finishes the session and opens the workspace.
            emailRedirectTo: siteUrl("/auth/callback"),
          },
        });

        if (error) {
          throw authError(400, error);
        }

        // Supabase answers an already-registered (confirmed) address with an obfuscated user that has no
        // identities, so the address is not leaked. Treat it like a confirmation-pending sign-up.
        // When email confirmation is enabled, Supabase
        // normally returns a user without a session.
        if (!data.session) {
          return "email_confirmation_required";
        }

        await refresh();
        return "signed_in";
      }

      const result = await api<{
        access_token: string;
      }>("/api/auth/register", {
        method: "POST",
        json: {
          email: email.trim(),
          password,
          full_name: fullName.trim(),
        },
      });

      try {
        localStorage.setItem(
          TOKEN_KEY,
          result.access_token
        );
      } catch {
        throw new ApiError(
          500,
          "Account created, but the login session could not be saved."
        );
      }

      await refresh();
      return "signed_in";
    },
    [requireSupabase, refresh],
  );

  const logout = useCallback(async () => {
    if (AUTH_MODE === "supabase") {
      const client = requireSupabase();

      const { error } = await client.auth.signOut();

      if (error) {
        throw new ApiError(500, error.message);
      }
    }

    clear();
  }, [requireSupabase, clear]);

  const [providers, setProviders] = useState<AuthProviders | null>(
    AUTH_MODE === "supabase" ? null : { linkedin: false, emailRecovery: false },
  );

  // Ask Supabase Auth which providers are really enabled, so the UI never offers a sign-in method that would fail.
  useEffect(() => {
    if (AUTH_MODE !== "supabase" || !SUPA_URL) return;
    let alive = true;
    fetch(`${SUPA_URL.replace(/\/+$/, "")}/auth/v1/settings`, { headers: { apikey: SUPA_ANON } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { external?: Record<string, boolean> } | null) => {
        if (!alive) return;
        setProviders({ linkedin: Boolean(s?.external?.linkedin_oidc), emailRecovery: Boolean(s?.external?.email ?? true) });
      })
      .catch(() => alive && setProviders({ linkedin: false, emailRecovery: true }));
    return () => {
      alive = false;
    };
  }, []);

  const requestPasswordReset = useCallback(
    async (email: string) => {
      const client = requireSupabase();
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: siteUrl("/reset-password"),
      });
      if (error) throw authError(400, error);
    },
    [requireSupabase],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      const client = requireSupabase();
      const { error } = await client.auth.updateUser({ password });
      if (error) throw authError(400, error);
    },
    [requireSupabase],
  );

  const resendConfirmation = useCallback(
    async (email: string) => {
      const client = requireSupabase();
      const { error } = await client.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: siteUrl("/auth/callback") },
      });
      if (error) throw authError(400, error);
    },
    [requireSupabase],
  );

  const signInWithLinkedIn = useCallback(
    async (next: string) => {
      const client = requireSupabase();
      const { error } = await client.auth.signInWithOAuth({
        provider: "linkedin_oidc",
        options: { redirectTo: siteUrl(`/auth/callback?next=${encodeURIComponent(next)}`) },
      });
      if (error) throw authError(400, error);
    },
    [requireSupabase],
  );

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      mode: AUTH_MODE,
      login,
      register,
      logout,
      refresh,
      providers,
      requestPasswordReset,
      updatePassword,
      resendConfirmation,
      signInWithLinkedIn,
    }),
    [
      user,
      loading,
      login,
      register,
      logout,
      refresh,
      providers,
      requestPasswordReset,
      updatePassword,
      resendConfirmation,
      signInWithLinkedIn,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth outside provider");
  }

  return context;
}

/* ------------------------------------------------------------------ toasts */

type Toast = {
  id: number;
  kind: "ok" | "error" | "info";
  text: string;
};

const ToastContext = createContext<
  (kind: Toast["kind"], text: string) => void
>(() => {});

function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback(
    (kind: Toast["kind"], text: string) => {
      const id = Date.now() + Math.random();

      setToasts((current) => [
        ...current.slice(-3),
        { id, kind, text },
      ]);

      setTimeout(
        () => {
          setToasts((current) =>
            current.filter((toast) => toast.id !== id)
          );
        },
        kind === "error" ? 7000 : 3800,
      );
    },
    [],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={`fade-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg shadow-lg`}
          >
            <span
              aria-hidden
              className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                toast.kind === "error" ? "bg-bad" : toast.kind === "ok" ? "bg-ok" : "bg-primary"
              }`}
            />
            <span className="min-w-0 flex-1">{toast.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ------------------------------------------------------------------ providers */

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
