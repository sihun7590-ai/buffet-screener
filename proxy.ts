import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// Runs the locale routing middleware first, then layers Supabase's session
// refresh on top of whatever response it produced (redirect or rewrite) —
// Server Components can only read cookies, so the access token has to be
// refreshed here or logins would silently expire mid-session.
export default async function proxy(request: NextRequest) {
  const response = intlMiddleware(request);

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // /auth is excluded so the email-confirmation callback (outside the
  // [locale] segment) isn't rewritten to a non-existent /en/auth/... route.
  matcher: ["/((?!api|_next|auth|.*\\..*).*)"],
};
