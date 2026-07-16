/**
 * Slate's learning record — the thing that makes Slate a study *system* rather
 * than a one-off solver. Tracks per-skill mastery, a daily streak, XP, and total
 * problems solved.
 *
 * v1 is client-side only (localStorage), so it works with zero backend and can
 * later be synced to a user account. All reads/writes are SSR-safe: on the
 * server (no window) they return an empty record and no-op.
 */

const STORAGE_KEY = "slate.progress.v1";

export type SkillStat = {
  /** Number of problems solved in this skill. */
  solved: number;
  /** Rolling mastery estimate in [0, 1]. */
  mastery: number;
  /** Average hints leaned on per solve (lower is stronger). */
  avgHints: number;
  /** Epoch ms of last practice. */
  lastPracticed: number;
};

export type MisconceptionStat = { count: number; last: number };

/** Running totals for confidence-vs-outcome calibration. */
export type Calibration = {
  samples: number;
  sumConfidence: number;
  sumScore: number;
  /** Sum of (confidence - score); positive = overconfident overall. */
  sumSignedGap: number;
};

/** A target exam and its date (local YYYY-MM-DD) for the countdown coach. */
export type ExamPlan = { examId: string; date: string };

export type Progress = {
  skills: Record<string, SkillStat>;
  /** Recurring error types the tutor has spotted, keyed by short tag. */
  misconceptions: Record<string, MisconceptionStat>;
  calibration: Calibration;
  examPlan: ExamPlan | null;
  /** Marking-score history per exam id, for grade prediction. */
  examScores: Record<string, { count: number; sumPct: number }>;
  streakCount: number;
  /** Local YYYY-MM-DD of the last day a problem was solved. */
  lastSolvedDay: string | null;
  totalSolved: number;
  xp: number;
};

export type SolveInput = {
  skill: string;
  difficulty: "easy" | "medium" | "hard";
  hintsUsed: number;
};

const DIFF_WEIGHT: Record<SolveInput["difficulty"], number> = {
  easy: 0.55,
  medium: 0.8,
  hard: 1,
};

const MASTERY_ALPHA = 0.4; // how fast mastery moves toward the latest result

export function emptyProgress(): Progress {
  return {
    skills: {},
    misconceptions: {},
    calibration: { samples: 0, sumConfidence: 0, sumScore: 0, sumSignedGap: 0 },
    examPlan: null,
    examScores: {},
    streakCount: 0,
    lastSolvedDay: null,
    totalSolved: 0,
    xp: 0,
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadProgress(): Progress {
  if (!isBrowser()) return emptyProgress();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    return {
      skills: parsed.skills ?? {},
      misconceptions: parsed.misconceptions ?? {},
      calibration:
        parsed.calibration ?? { samples: 0, sumConfidence: 0, sumScore: 0, sumSignedGap: 0 },
      examPlan: parsed.examPlan ?? null,
      examScores: parsed.examScores ?? {},
      streakCount: parsed.streakCount ?? 0,
      lastSolvedDay: parsed.lastSolvedDay ?? null,
      totalSolved: parsed.totalSolved ?? 0,
      xp: parsed.xp ?? 0,
    };
  } catch {
    return emptyProgress();
  }
}

function save(p: Progress): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // storage full / disabled — progress just won't persist this session.
  }
}

function localDay(d = new Date()): string {
  // Local date, not UTC, so streaks respect the user's calendar day.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ams = Date.UTC(ay, am - 1, ad);
  const bms = Date.UTC(by, bm - 1, bd);
  return Math.round((bms - ams) / 86_400_000);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Record a solved problem and return the updated progress (also persisted).
 * Mastery credit rewards harder problems and penalizes heavy hint use, so a
 * clean solve on a hard problem moves the needle far more than a heavily-hinted
 * easy one.
 */
export function recordSolve(input: SolveInput): Progress {
  const p = loadProgress();
  const today = localDay();

  // --- streak ---
  if (p.lastSolvedDay === null) {
    p.streakCount = 1;
  } else {
    const gap = daysBetween(p.lastSolvedDay, today);
    if (gap === 0) {
      // already counted today; keep streak
      p.streakCount = Math.max(1, p.streakCount);
    } else if (gap === 1) {
      p.streakCount += 1;
    } else {
      p.streakCount = 1;
    }
  }
  p.lastSolvedDay = today;

  // --- mastery for this skill ---
  const prev = p.skills[input.skill] ?? {
    solved: 0,
    mastery: 0,
    avgHints: 0,
    lastPracticed: 0,
  };
  const hintPenalty = clamp01(1 - Math.min(input.hintsUsed, 4) / 6); // 0 hints => 1, 4 hints => 0.33
  const credit = clamp01(DIFF_WEIGHT[input.difficulty] * hintPenalty);
  const mastery = clamp01(prev.mastery * (1 - MASTERY_ALPHA) + credit * MASTERY_ALPHA);
  const solved = prev.solved + 1;
  const avgHints = (prev.avgHints * prev.solved + input.hintsUsed) / solved;

  p.skills[input.skill] = { solved, mastery, avgHints, lastPracticed: Date.now() };

  // --- xp & totals ---
  const xpGain = 10 + Math.round(credit * 15) + (input.hintsUsed === 0 ? 5 : 0);
  p.xp += xpGain;
  p.totalSolved += 1;

  save(p);
  return p;
}

/** Returns skills sorted weakest-first among those practiced. */
export function weakestSkills(p: Progress): Array<{ skill: string; stat: SkillStat }> {
  return Object.entries(p.skills)
    .map(([skill, stat]) => ({ skill, stat }))
    .sort((a, b) => a.stat.mastery - b.stat.mastery);
}

/** Level derived from XP — simple, felt progression. */
export function levelForXp(xp: number): { level: number; intoLevel: number; span: number } {
  // Each level costs a bit more than the last.
  let level = 1;
  let remaining = xp;
  let span = 100;
  while (remaining >= span) {
    remaining -= span;
    level += 1;
    span = Math.round(span * 1.25);
  }
  return { level, intoLevel: remaining, span };
}

export function resetProgress(): Progress {
  const fresh = emptyProgress();
  save(fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Adaptive practice — turn the mastery model into what to serve next.
// ---------------------------------------------------------------------------

export type Difficulty = "easy" | "medium" | "hard";

/** Ramp difficulty with mastery: struggling → easy, solid → hard. */
export function recommendedDifficulty(mastery: number): Difficulty {
  if (mastery >= 0.7) return "hard";
  if (mastery >= 0.35) return "medium";
  return "easy";
}

/**
 * Choose the topic to practice next: weakest mastery first, with unpracticed
 * topics treated as highest priority, and ties broken toward the least-recently
 * practiced so attention rotates (a light spaced-repetition effect).
 */
export function pickNextSkill(p: Progress, topics: string[]): string {
  let best = topics[0];
  let bestScore = Infinity;
  for (const t of topics) {
    const s = p.skills[t];
    const mastery = s?.mastery ?? 0;
    const last = s?.lastPracticed ?? 0;
    // mastery dominates; recency (older = smaller) breaks ties.
    const score = mastery * 1e15 + last;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

// --- handoff from the dashboard "Practice it" button to the tutor ---

const PENDING_KEY = "slate.pending.v1";

export type PendingPractice = { examId?: string; topic: string; difficulty: Difficulty };

export function setPendingPractice(p: PendingPractice): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

/** Reads and clears any pending practice request (one-shot). */
export function consumePendingPractice(): PendingPractice | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(PENDING_KEY);
    const p = JSON.parse(raw) as PendingPractice;
    if (p && typeof p.topic === "string" && (p.difficulty === "easy" || p.difficulty === "medium" || p.difficulty === "hard")) {
      return p;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Misconception memory — recurring error types the tutor keeps seeing.
// ---------------------------------------------------------------------------

/** Records one occurrence of an error type (normalized) and returns updated progress. */
export function recordMisconception(tag: string): Progress {
  const clean = tag.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
  const p = loadProgress();
  if (!clean) return p;
  const prev = p.misconceptions[clean] ?? { count: 0, last: 0 };
  p.misconceptions[clean] = { count: prev.count + 1, last: Date.now() };
  save(p);
  return p;
}

/** The student's most frequent error types, most-common first. */
export function topMisconceptions(p: Progress, n = 5): Array<{ tag: string; count: number }> {
  return Object.entries(p.misconceptions)
    .map(([tag, v]) => ({ tag, count: v.count }))
    .sort((a, b) => b.count - a.count || b.tag.localeCompare(a.tag))
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// Confidence calibration — how well predicted confidence matches actual score.
// ---------------------------------------------------------------------------

/** Records a (confidence, score) pair, both in [0,1], and returns updated progress. */
export function recordConfidence(confidence: number, score: number): Progress {
  const p = loadProgress();
  const c = Math.max(0, Math.min(1, confidence));
  const s = Math.max(0, Math.min(1, score));
  const cal = p.calibration;
  cal.samples += 1;
  cal.sumConfidence += c;
  cal.sumScore += s;
  cal.sumSignedGap += c - s;
  save(p);
  return p;
}

/**
 * Calibration read-out once there are enough samples. `bias` is the average of
 * (confidence − score): positive = overconfident, negative = underconfident.
 */
export function calibrationSummary(
  p: Progress,
): { samples: number; bias: number; label: string } | null {
  const cal = p.calibration;
  if (!cal || cal.samples < 3) return null;
  const bias = cal.sumSignedGap / cal.samples;
  let label = "Well calibrated";
  if (bias > 0.15) label = "Tends to be overconfident";
  else if (bias < -0.15) label = "Tends to be underconfident";
  return { samples: cal.samples, bias, label };
}

// ---------------------------------------------------------------------------
// Exam-date countdown coach.
// ---------------------------------------------------------------------------

export function setExamPlan(examId: string, date: string): Progress {
  const p = loadProgress();
  p.examPlan = { examId, date };
  save(p);
  return p;
}

export function clearExamPlan(): Progress {
  const p = loadProgress();
  p.examPlan = null;
  save(p);
  return p;
}

/** Whole days from today (local) until the given YYYY-MM-DD. Negative if past. */
export function daysUntil(date: string): number {
  return daysBetween(localDay(), date);
}

// ---------------------------------------------------------------------------
// Predicted grade — marking-score history feeding a per-exam grade estimate.
// ---------------------------------------------------------------------------

/** Records one marking result (fraction 0..1) against an exam. */
export function recordMarkScore(examId: string, pct: number): Progress {
  const p = loadProgress();
  const s = Math.max(0, Math.min(1, pct));
  const prev = p.examScores[examId] ?? { count: 0, sumPct: 0 };
  p.examScores[examId] = { count: prev.count + 1, sumPct: prev.sumPct + s };
  save(p);
  return p;
}

/** Average marking fraction for an exam, or null if none yet. */
export function examScoreAvg(p: Progress, examId: string): { count: number; avg: number } | null {
  const e = p.examScores[examId];
  if (!e || e.count === 0) return null;
  return { count: e.count, avg: e.sumPct / e.count };
}

/**
 * Blends marking history (primary signal) with average mastery over the exam's
 * practiced topics to produce a 0..1 predicted score. Needs at least 2 marked
 * attempts to return a result. Topic masteries are passed in to keep this file
 * decoupled from the exams list.
 */
export function predictedScore(
  p: Progress,
  examId: string,
  examTopics: string[],
): { score: number; markCount: number } | null {
  const marks = examScoreAvg(p, examId);
  if (!marks || marks.count < 2) return null;
  const practiced = examTopics
    .map((t) => p.skills[t]?.mastery)
    .filter((m): m is number => typeof m === "number");
  const avgMastery = practiced.length
    ? practiced.reduce((a, b) => a + b, 0) / practiced.length
    : marks.avg;
  const score = 0.7 * marks.avg + 0.3 * avgMastery;
  return { score: Math.max(0, Math.min(1, score)), markCount: marks.count };
}
