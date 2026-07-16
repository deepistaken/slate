/**
 * Single entry point for calling Slate's AI routes from the browser. Attaches
 * the signed-in user's Supabase access token so the server can authenticate and
 * meter the request. Every fetch to /api/* in the app should go through this so
 * auth headers can never be forgotten at a call site.
 */
import { getAccessToken } from "@/lib/supabase-browser";

/** Thrown when the user isn't signed in — callers can catch and redirect. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("You need to sign in to use the tutor.");
    this.name = "NotAuthenticatedError";
  }
}

/**
 * POST a JSON body to an AI route with the auth bearer token attached.
 * Returns the raw Response so callers keep their existing res.ok / status /
 * json() / text() handling.
 */
export async function callAi(path: string, body: unknown): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new NotAuthenticatedError();
  return fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
