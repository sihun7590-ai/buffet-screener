// Read as static property accesses so Next.js inlines them at build time.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function hasSupabaseConfig(): boolean {
  return Boolean(url && anonKey);
}

// supabase-js throws on an empty URL, and the clients are constructed on every
// page (the header asks who's signed in), so a deployment that forgot these
// variables would 500 the whole site rather than just the parts that need an
// account. Falling back to an address that can't authenticate degrades that to
// "nobody is signed in": the screener, the stock pages, and MY Page's sign-in
// prompt all still render. See the deployment section of the README.
export const SUPABASE_URL = url || "https://unconfigured.supabase.co";
export const SUPABASE_ANON_KEY = anonKey || "unconfigured";
