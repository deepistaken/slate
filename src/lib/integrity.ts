/**
 * Integrity mode — for supervised / assessed use (teachers, parents).
 * When on, the tutor never reveals answers or full worked steps, and the
 * student's session can be exported as a tamper-evident report: the full
 * problem, stroke-by-stroke work with timing, hints used, and a SHA-256 hash of
 * the content so any later edit is detectable.
 */

const KEY = "slate.integrity";

export function getIntegrityMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setIntegrityMode(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

export type IntegrityInput = {
  examLabel: string;
  problem: { problem: string; latex: string };
  strokes: Array<{ points?: Array<{ t?: number }> }>;
  messages: Array<{ role: string; content: string }>;
  hintsUsed: number;
};

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Builds the report, hashes it, and triggers a download. Browser-only. */
export async function buildAndDownloadIntegrityReport(input: IntegrityInput): Promise<void> {
  const strokes = input.strokes ?? [];
  let firstT = Infinity;
  let lastT = -Infinity;
  for (const s of strokes) {
    for (const p of s.points ?? []) {
      const t = p.t ?? 0;
      if (t) {
        if (t < firstT) firstT = t;
        if (t > lastT) lastT = t;
      }
    }
  }
  const workMs = Number.isFinite(firstT) && lastT > 0 ? lastT - firstT : 0;

  const payload = {
    kind: "slate-integrity-report",
    version: 1,
    createdAt: new Date().toISOString(),
    exam: input.examLabel,
    problem: input.problem,
    workMs,
    workMinutes: Math.round(workMs / 6000) / 10,
    strokeCount: strokes.length,
    hintsUsed: input.hintsUsed,
    messages: input.messages,
    strokes,
  };
  const canonical = JSON.stringify(payload);
  const sha256 = await sha256Hex(canonical);
  const full = { ...payload, sha256 };

  const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `slate-integrity-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
