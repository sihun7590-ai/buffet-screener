"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import Panel from "@/components/Panel";

type Mode = "signIn" | "signUp";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.32-.17-1.94H10v3.68h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.99-4.33 2.99-7.26Z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.96-.9 6.61-2.44l-3.23-2.5c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H1.08v2.59A10 10 0 0 0 10 20Z" />
      <path fill="#FBBC05" d="M4.41 11.9a6 6 0 0 1 0-3.8V5.51H1.08a10 10 0 0 0 0 8.98l3.33-2.59Z" />
      <path fill="#EA4335" d="M10 3.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0 10 10 0 0 0 1.08 5.51L4.41 8.1C5.2 5.74 7.4 3.98 10 3.98Z" />
    </svg>
  );
}

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  // Set by proxy.ts when it bounced an anonymous visitor here, already
  // locale-prefixed (e.g. "/en/stock/AAPL") — navigated with a plain reload
  // rather than next-intl's router, since pushing an already-prefixed path
  // through next-intl's locale-relative router would prefix the locale twice.
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();

    if (mode === "signUp") {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      setConfirmSent(true);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    if (next) {
      window.location.href = next;
    } else {
      router.push("/mypage");
      router.refresh();
    }
  };

  // Supabase redirects the whole page to the provider, so there's no local
  // busy/success state to manage here — the browser navigates away.
  const signInWithOAuth = async (provider: "google") => {
    setError(null);
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);
    const { error: oauthError } = await createClient().auth.signInWithOAuth({
      provider,
      options: { redirectTo: redirectTo.toString() },
    });
    if (oauthError) setError(oauthError.message);
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16 sm:px-6">
      <Panel title={t(mode === "signIn" ? "signInTitle" : "signUpTitle")}>
        {confirmSent ? (
          <p className="text-[13px] leading-relaxed text-ink-muted">{t("confirmSent", { email })}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => signInWithOAuth("google")}
              className="flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-surface text-[13px] font-semibold text-ink transition-colors hover:bg-surface-hover"
            >
              <GoogleIcon />
              {t("continueWithGoogle")}
            </button>

            <div className="flex items-center gap-3 text-[11px] text-ink-faint">
              <span className="h-px flex-1 bg-line" />
              {t("orDivider")}
              <span className="h-px flex-1 bg-line" />
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="text-ink-muted">{t("email")}</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-9 rounded-md border border-line bg-subtle px-2.5 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>
              <label className="flex flex-col gap-1 text-[13px]">
                <span className="text-ink-muted">{t("password")}</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-9 rounded-md border border-line bg-subtle px-2.5 text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </label>

              {error && <p className="text-[12px] text-down">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 h-9 rounded-md bg-brand text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {t(mode === "signIn" ? "signIn" : "signUp")}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode(mode === "signIn" ? "signUp" : "signIn");
                  setError(null);
                }}
                className="text-[12px] text-ink-muted underline-offset-2 hover:text-brand hover:underline"
              >
                {t(mode === "signIn" ? "switchToSignUp" : "switchToSignIn")}
              </button>
            </form>
          </div>
        )}
      </Panel>
    </main>
  );
}
