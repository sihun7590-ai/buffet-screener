import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The service-role key bypasses Row Level Security entirely, so this client
// belongs to batch jobs and server-only code — never import it from anything
// that can end up in a browser bundle.
//
// It's read from SUPABASE_SERVICE_ROLE_KEY rather than a NEXT_PUBLIC_ name
// precisely so Next.js cannot inline it into client JavaScript by accident.
// Returns null when it isn't configured, so `npm run refresh` still works for
// a checkout that only wants to regenerate data/scores.json.
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    // A batch job has no browser to keep a session for, and persisting one
    // would try to touch localStorage.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
