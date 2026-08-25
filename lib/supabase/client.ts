import { createBrowserClient } from "@supabase/ssr";

// One client per call site is the documented pattern for @supabase/ssr — it's
// cheap (just wraps fetch + the shared cookie jar), so there's no need to
// memoize it across components.
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
