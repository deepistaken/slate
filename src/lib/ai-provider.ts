import { createGoogleGenerativeAI } from "@ai-sdk/google";

/**
 * Slate's model access. Uses Google's Gemini API directly (no Lovable gateway).
 * Set GOOGLE_GENERATIVE_AI_API_KEY in your environment (locally in .env, in
 * production as a Cloudflare secret). Get a free key at https://aistudio.google.com/apikey.
 *
 * Model choice is free-tier friendly by default. gemini-2.5-flash gives ~1,500
 * requests/day free with vision — the right pick for the auto-watch loop. If you
 * add billing later you can point SLATE_TUTOR_MODEL at gemini-2.5-pro for sharper
 * reasoning without touching code.
 */
export const MODELS = {
  /** Vision model that reads the handwriting canvas (called frequently). */
  tutor: process.env.SLATE_TUTOR_MODEL || "gemini-3.5-flash",
  /** Text model for generating / extracting problems (called occasionally). */
  generate: process.env.SLATE_GENERATE_MODEL || "gemini-3.5-flash",
} as const;

let cached: ReturnType<typeof createGoogleGenerativeAI> | null = null;

/** Returns a model handle, creating the provider on first use. Throws a clear
 * error if the API key is missing so the route can surface a friendly message. */
export function getModel(modelId: string) {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GOOGLE_GENERATIVE_AI_API_KEY. Get a free key at https://aistudio.google.com/apikey and set it in your environment.",
    );
  }
  if (!cached) cached = createGoogleGenerativeAI({ apiKey });
  return cached(modelId);
}
