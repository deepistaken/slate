/**
 * Teacher-editable mark schemes. The AI proposes a scheme for a problem; a
 * teacher can review, edit, and save it, after which marking runs against the
 * teacher's version. Overrides are stored client-side (localStorage), keyed by a
 * hash of the problem text, so they survive reloads and carry into any future
 * account-synced version.
 */

export type Criterion = {
  /** Short code like "M1" (method) or "A1" (accuracy). */
  code: string;
  description: string;
  marks: number;
};

export type MarkScheme = {
  criteria: Criterion[];
  total: number;
};

const TEACHER_KEY = "slate.teacher";
const SCHEMES_KEY = "slate.schemes.v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

// --- teacher mode toggle ---

export function getTeacherMode(): boolean {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(TEACHER_KEY) === "1";
  } catch {
    return false;
  }
}

export function setTeacherMode(on: boolean): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(TEACHER_KEY, on ? "1" : "0");
  } catch {
    // ignore
  }
}

// --- scheme totals + validation ---

export function schemeTotal(criteria: Criterion[]): number {
  return criteria.reduce((sum, c) => sum + (Number.isFinite(c.marks) ? c.marks : 0), 0);
}

/** Normalizes an arbitrary parsed object into a safe MarkScheme. */
export function normalizeScheme(raw: unknown): MarkScheme | null {
  if (!raw || typeof raw !== "object") return null;
  const anyRaw = raw as { criteria?: unknown };
  if (!Array.isArray(anyRaw.criteria)) return null;
  const criteria: Criterion[] = anyRaw.criteria
    .map((c) => {
      const cc = c as Partial<Criterion>;
      return {
        code: typeof cc.code === "string" ? cc.code.slice(0, 12) : "",
        description: typeof cc.description === "string" ? cc.description.slice(0, 200) : "",
        marks: typeof cc.marks === "number" && Number.isFinite(cc.marks) ? Math.max(0, cc.marks) : 0,
      };
    })
    .filter((c) => c.description.length > 0)
    .slice(0, 20);
  if (!criteria.length) return null;
  return { criteria, total: schemeTotal(criteria) };
}

// --- per-problem override storage ---

/** Stable hash of the problem text (djb2) used as the storage key. */
export function hashProblem(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function readAll(): Record<string, MarkScheme> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(SCHEMES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MarkScheme>) : {};
  } catch {
    return {};
  }
}

export function loadScheme(problemText: string): MarkScheme | null {
  const all = readAll();
  return all[hashProblem(problemText)] ?? null;
}

export function saveScheme(problemText: string, scheme: MarkScheme): void {
  if (!isBrowser()) return;
  try {
    const all = readAll();
    all[hashProblem(problemText)] = { criteria: scheme.criteria, total: schemeTotal(scheme.criteria) };
    window.localStorage.setItem(SCHEMES_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}

export function clearScheme(problemText: string): void {
  if (!isBrowser()) return;
  try {
    const all = readAll();
    delete all[hashProblem(problemText)];
    window.localStorage.setItem(SCHEMES_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
}
