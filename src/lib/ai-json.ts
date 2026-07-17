import { generateText, type ModelMessage } from "ai";

// Derive the model type straight from generateText so we don't depend on a
// named type export that may differ across ai-sdk versions.
type ModelArg = Parameters<typeof generateText>[0]["model"];

/**
 * Models occasionally wrap JSON in prose or ```code fences``` despite being told
 * not to. This pulls the first balanced {...} object out of a string and parses
 * it, so one stray token doesn't blow up the whole request.
 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  let s = raw.trim();

  // Strip leading/trailing code fences if present.
  s = s
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  // Fast path: the whole thing is valid JSON.
  try {
    return JSON.parse(s) as T;
  } catch {
    // fall through to bracket scan
  }

  // Scan for the first balanced top-level {...}, respecting strings/escapes.
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const candidate = s.slice(start, i + 1);
        try {
          return JSON.parse(candidate) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

type GenArgs =
  | { model: ModelArg; prompt: string; messages?: never }
  | { model: ModelArg; messages: ModelMessage[]; prompt?: never };

/**
 * Calls the model and returns parsed JSON. If the first response can't be
 * parsed, it retries once with a terse "return ONLY valid JSON" nudge before
 * giving up. Returns null only if both attempts fail.
 */
export async function generateJson<T = unknown>(args: GenArgs): Promise<T | null> {
  // maxRetries 4 → exponential backoff spans ~30s, enough to ride out Gemini's
  // free-tier per-minute rate limit instead of failing the whole upload.
  const first = await generateText({
    ...(args as Parameters<typeof generateText>[0]),
    maxRetries: 4,
  });
  const parsed = extractJson<T>(first.text);
  if (parsed !== null) return parsed;

  // One corrective retry.
  const retryMessages: ModelMessage[] = args.messages
    ? [
        ...args.messages,
        { role: "assistant", content: first.text },
        {
          role: "user",
          content:
            "That was not valid JSON. Respond again with ONLY the JSON object — no prose, no code fences.",
        },
      ]
    : [
        { role: "user", content: args.prompt! },
        { role: "assistant", content: first.text },
        {
          role: "user",
          content:
            "That was not valid JSON. Respond again with ONLY the JSON object — no prose, no code fences.",
        },
      ];

  const second = await generateText({ model: args.model, messages: retryMessages, maxRetries: 4 });
  return extractJson<T>(second.text);
}
