/**
 * Shared gate for every AI route. One call enforces the three ship-blockers:
 *   1. Authentication — the request must carry a valid Supabase bearer token.
 *   2. Per-user daily quota — the free-tier meter.
 *   3. Global daily spend cap — the hard "don't bankrupt me" backstop.
 *
 * Usage in a route handler:
 *   const gate = await guardAi(request);
 *   if (!gate.ok) return gate.response;
 *   // ...gate.userId is the authenticated user id
 */
import {
  consumeQuota,
  getUserFromRequest,
  supabaseServerConfigured,
} from "@/lib/supabase-server";

export type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

function deny(status: number, message: string): { ok: false; response: Response } {
  return { ok: false, response: new Response(message, { status }) };
}

/**
 * @param cost how many quota units this call consumes (default 1). Cheap,
 *             high-frequency calls (the auto-watch loop) stay at 1; heavier
 *             one-off calls can pass more.
 */
export async function guardAi(request: Request, cost = 1): Promise<GuardResult> {
  // If Supabase isn't configured, refuse rather than silently running an
  // unauthenticated, unmetered AI endpoint (the exact thing we're fixing).
  if (!supabaseServerConfigured()) {
    return deny(
      503,
      "Accounts are not configured on the server yet. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return deny(401, "Please sign in to use the tutor.");
  }

  const quota = await consumeQuota(user.id, cost);
  if (!quota.allowed) {
    // Distinguish the two caps so the client can show the right message.
    const globalHit = quota.globalUsed >= quota.userUsed;
    return deny(
      429,
      globalHit
        ? "Slate has hit its daily usage limit. Please try again tomorrow."
        : "You've reached today's practice limit. It resets tomorrow — or upgrade for more.",
    );
  }

  return { ok: true, userId: user.id };
}
