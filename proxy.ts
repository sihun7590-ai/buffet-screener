import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseConfig } from "./lib/supabase/env";

const intlMiddleware = createIntlMiddleware(routing);
const LOCALE_PATTERN = new RegExp(`^/(${routing.locales.join("|")})(?=/|$)`);

// Runs the locale routing middleware first, then layers Supabase's session
// refresh on top of whatever response it produced (redirect or rewrite) —
// Server Components can only read cookies, so the access token has to be
// refreshed here or logins would silently expire mid-session. The whole app
// is login-gated: nothing renders (screener, stock pages, backtest) unless a
// session is present, since the point of accounts here is that everyone
// visiting is meant to be a signed-in user, not an anonymous browser.
export default async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);

  // Without a configured project, login itself can't work — falling through
  // instead of gating keeps `npm run dev` usable with no env vars set (see
  // lib/supabase/env.ts), same as the rest of the app's graceful degradation.
  if (!hasSupabaseConfig()) return response;

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return response;

  // Which locale to send an anonymous visitor to: whatever's already in the
  // URL, or — for "/" and similar unprefixed paths — wherever intlMiddleware
  // just decided to redirect/rewrite to, so locale detection (Accept-Language,
  // cookie) still applies instead of always falling back to the default.
  const pathname = request.nextUrl.pathname;
  const prefixed = pathname.match(LOCALE_PATTERN)?.[1];
  const redirectLocation = response.headers.get("location");
  const fromRedirect = redirectLocation
    ? new URL(redirectLocation, request.url).pathname.match(LOCALE_PATTERN)?.[1]
    : undefined;
  const locale = prefixed ?? fromRedirect ?? routing.defaultLocale;

  const loginPath = `/${locale}/login`;
  if (pathname === loginPath) return response;

  const redirectUrl = new URL(loginPath, request.url);
  // So the login page can send a visitor back to whatever they were actually
  // trying to reach, instead of always landing on /mypage.
  const next = pathname + request.nextUrl.search;
  if (next !== "/" && next !== loginPath) redirectUrl.searchParams.set("next", next);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  // /auth is excluded so the email-confirmation callback (outside the
  // [locale] segment) isn't rewritten to a non-existent /en/auth/... route.
  matcher: ["/((?!api|_next|auth|.*\\..*).*)"],
};
