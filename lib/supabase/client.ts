import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

// One client per call site is the documented pattern for @supabase/ssr — it's
// cheap (just wraps fetch + the shared cookie jar), so there's no need to
// memoize it across components.
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
