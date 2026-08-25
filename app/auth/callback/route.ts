import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's confirmation email links here with a PKCE `code` (set via
// `emailRedirectTo` at sign-up time). Exchanging it sets the session cookie,
// then we hand the user back to the locale-routed app.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  // Carries the page the visitor was originally trying to reach (set by
  // proxy.ts, round-tripped through the OAuth/email-confirmation redirect).
  const next = searchParams.get("next");
  return NextResponse.redirect(`${origin}${next && next.startsWith("/") ? next : "/"}`);
}
