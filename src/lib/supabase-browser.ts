/**
 * Browser-side Supabase client (singleton).
 *
 * Uses the public anon key — safe to ship to the browser; row-level security in
 * the database is what actually protects data. Only VITE_-prefixed vars are
 * available here, and they are the only Supabase values allowed in the bundle
 * (never the service_role key).
 *
 * Returns null when Supabase isn't configured yet, so the app still renders in
 * a "logged-out, AI disabled" state instead of crashing.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the browser has the config it needs to talk to Supabase. */
export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (typeof window === "undefined") return null; // never build the client during SSR
  if (!client) {
    client = createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Current access token (JWT) for authorizing API calls, or null if signed out. */
export async function getAccessToken(): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}
