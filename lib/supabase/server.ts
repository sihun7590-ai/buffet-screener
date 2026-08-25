import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// For Server Components / Route Handlers. Writing cookies from a Server
// Component throws (Next.js only allows it in Server Actions / Route
// Handlers) — that's fine here because proxy.ts already refreshes the
// session on every request, so this client only ever needs to read it.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — ignored, see comment above.
        }
      },
    },
  });
}
