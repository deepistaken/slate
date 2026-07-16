/**
 * Server-side Supabase access (Cloudflare Worker runtime).
 *
 * Uses the service_role key, which bypasses row-level security — so this module
 * must ONLY ever be imported from server route handlers, never from client
 * components. It reads secrets from process.env (populated from .dev.vars in dev
 * and from Cloudflare secrets in production, same as ai-provider.ts).
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.length > 0 ? v : undefined;
}

/** True when the server has everything it needs for auth + metering. */
export function supabaseServerConfigured(): boolean {
  return Boolean(env("SUPABASE_URL") && env("SUPABASE_SERVICE_ROLE_KEY"));
}

let admin: SupabaseClient | null = null;

/** Service-role client. Throws a clear error if secrets are missing. */
export function getSupabaseAdmin(): SupabaseClient {
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).",
    );
  }
  if (!admin) {
    admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return admin;
}

/**
 * Verify the caller's bearer token and return the authenticated user, or null.
 * The token is a Supabase JWT sent by the browser in the Authorization header.
 */
export async function getUserFromRequest(request: Request): Promise<User | null> {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1];
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

function intEnv(key: string, fallback: number): number {
  const raw = env(key);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const DEFAULT_USER_DAILY_LIMIT = intEnv("SLATE_DAILY_USER_LIMIT", 400);
export const DEFAULT_GLOBAL_DAILY_LIMIT = intEnv("SLATE_DAILY_GLOBAL_LIMIT", 20000);

export type QuotaResult = { allowed: boolean; userUsed: number; globalUsed: number };

/**
 * Atomically reserve `cost` units of quota for the user for today. Returns
 * allowed=false if either the per-user or the global daily cap would be
 * exceeded (in which case nothing was consumed). Fails OPEN on an unexpected
 * DB error so a metering outage never takes down the tutor — the global cap is
 * the real bankruptcy backstop and any single error is bounded.
 */
/** SHA-256 hex of a string (used to fingerprint canvas images without storing them). */
export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type InteractionLog = {
  userId: string;
  mode: string;
  imageSha256?: string | null;
  readAs?: string | null;
  readConfidence?: string | null;
  misconception?: string | null;
};

/**
 * Record one tutor read for the eval/quality moat. Fire-and-forget: never let a
 * logging failure affect the student's response.
 */
export async function logInteraction(entry: InteractionLog): Promise<void> {
  try {
    await getSupabaseAdmin().from("interaction_logs").insert({
      user_id: entry.userId,
      mode: entry.mode,
      image_sha256: entry.imageSha256 ?? null,
      read_as: entry.readAs ?? null,
      read_confidence: entry.readConfidence ?? null,
      misconception: entry.misconception ?? null,
    });
  } catch (e) {
    console.error("logInteraction failed:", e);
  }
}

export async function consumeQuota(userId: string, cost = 1): Promise<QuotaResult> {
  try {
    const { data, error } = await getSupabaseAdmin().rpc("consume_quota", {
      p_user: userId,
      p_cost: cost,
      p_user_limit: DEFAULT_USER_DAILY_LIMIT,
      p_global_limit: DEFAULT_GLOBAL_DAILY_LIMIT,
    });
    if (error) {
      console.error("consume_quota error:", error.message);
      return { allowed: true, userUsed: 0, globalUsed: 0 };
    }
    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: Boolean(row?.allowed),
      userUsed: Number(row?.user_used ?? 0),
      globalUsed: Number(row?.global_used ?? 0),
    };
  } catch (e) {
    console.error("consume_quota threw:", e);
    return { allowed: true, userUsed: 0, globalUsed: 0 };
  }
}
