/**
 * Exam presets. Each exam brings its own topic taxonomy, language, and style,
 * all feeding the same mastery + adaptive engine. Adding a new exam here is the
 * only change needed to support it end-to-end.
 *
 * Topic labels double as the mastery keys in progress.ts, so they must be unique
 * across exams. The "general" exam keeps its original labels so existing
 * progress from before exam support carries over unchanged.
 */

export type ExamLanguage = "English" | "German" | "French";

export type Exam = {
  id: string;
  /** Shown in the exam picker. */
  label: string;
  /** Short tagline for menus / marketing. */
  blurb: string;
  /** Language problems, checkpoints, and tutor replies are written in. */
  language: ExamLanguage;
  /** Extra guidance handed to the problem generator to match exam style. */
  styleNote?: string;
  /** Ordered topic labels (also used as mastery keys). */
  topics: string[];
};

export const EXAMS: Exam[] = [
  {
    id: "general",
    label: "General practice",
    blurb: "Core algebra & calculus, in English.",
    language: "English",
    topics: [
      "Algebra: linear equations",
      "Algebra: quadratic equations",
      "Algebra: systems of equations",
      "Calculus: limits",
      "Calculus: derivatives",
      "Calculus: integrals",
    ],
  },
  {
    id: "abitur",
    label: "German Abitur — Mathematik",
    blurb: "Analysis, Geometrie & Stochastik, auf Deutsch.",
    language: "German",
    styleNote:
      "Write in the style of the German Abitur (Leistungsfach/Grundkurs). Use standard German mathematical phrasing. Problems should be at Abitur level and self-contained.",
    topics: [
      "Analysis: Ableitungen & Kurvendiskussion",
      "Analysis: Integralrechnung",
      "Analysis: e-Funktionen",
      "Analysis: Extremwertprobleme",
      "Geometrie: Vektoren & Geraden",
      "Geometrie: Ebenen & Lagebeziehungen",
      "Geometrie: Abstände & Winkel",
      "Stochastik: Wahrscheinlichkeit & Baumdiagramme",
      "Stochastik: Binomialverteilung",
      "Stochastik: Hypothesentests",
    ],
  },
  {
    id: "bac_fr",
    label: "Baccalauréat — Spécialité Maths",
    blurb: "Analyse, géométrie & probabilités, en français.",
    language: "French",
    styleNote:
      "Write in the style of the French Baccalauréat (spécialité mathématiques). Use standard French mathematical phrasing.",
    topics: [
      "Analyse : dérivation et étude de fonctions",
      "Analyse : intégration",
      "Analyse : suites et limites",
      "Analyse : exponentielle et logarithme",
      "Géométrie dans l'espace : vecteurs, droites, plans",
      "Probabilités : variables aléatoires",
      "Probabilités : loi binomiale",
    ],
  },
  {
    id: "alevel",
    label: "A-Level Mathematics",
    blurb: "Pure, statistics & mechanics (UK).",
    language: "English",
    styleNote: "Write in the style of UK A-Level Mathematics (Edexcel/AQA).",
    topics: [
      "Pure: Algebra & functions",
      "Pure: Differentiation",
      "Pure: Integration",
      "Pure: Trigonometry",
      "Pure: Sequences & series",
      "Statistics: Probability & distributions",
      "Mechanics: Kinematics",
    ],
  },
  {
    id: "ib_aa",
    label: "IB Mathematics AA (HL)",
    blurb: "Analysis & Approaches, Higher Level.",
    language: "English",
    styleNote: "Write in the style of IB Mathematics: Analysis and Approaches, Higher Level.",
    topics: [
      "Algebra & functions",
      "Calculus: differentiation",
      "Calculus: integration",
      "Trigonometry",
      "Vectors",
      "Probability & statistics",
    ],
  },
];

export const DEFAULT_EXAM_ID = "general";

export function getExam(id: string): Exam {
  return EXAMS.find((e) => e.id === id) ?? EXAMS[0];
}

/** Finds which exam owns a given topic label (mastery key). */
export function findExamForTopic(topic: string): Exam | undefined {
  return EXAMS.find((e) => e.topics.includes(topic));
}

/** Maps a 0..1 score to a short grade label in the exam's own grading system. */
export function gradeForExam(examId: string, score: number): string {
  const s = Math.max(0, Math.min(1, score));
  switch (examId) {
    case "abitur":
      if (s >= 0.92) return "1 (sehr gut)";
      if (s >= 0.78) return "2 (gut)";
      if (s >= 0.64) return "3 (befriedigend)";
      if (s >= 0.5) return "4 (ausreichend)";
      if (s >= 0.3) return "5 (mangelhaft)";
      return "6 (ungenügend)";
    case "alevel":
      if (s >= 0.9) return "A*";
      if (s >= 0.8) return "A";
      if (s >= 0.7) return "B";
      if (s >= 0.6) return "C";
      if (s >= 0.5) return "D";
      if (s >= 0.4) return "E";
      return "U";
    case "bac_fr": {
      const note = Math.round(s * 20);
      const mention =
        note >= 16
          ? " · mention très bien"
          : note >= 14
            ? " · mention bien"
            : note >= 12
              ? " · mention assez bien"
              : note >= 10
                ? " · admis"
                : "";
      return `${note}/20${mention}`;
    }
    case "ib_aa":
      if (s >= 0.85) return "7";
      if (s >= 0.72) return "6";
      if (s >= 0.6) return "5";
      if (s >= 0.48) return "4";
      if (s >= 0.34) return "3";
      if (s >= 0.2) return "2";
      return "1";
    default: {
      const pct = Math.round(s * 100);
      const letter =
        pct >= 90 ? "A" : pct >= 80 ? "B" : pct >= 70 ? "C" : pct >= 60 ? "D" : "F";
      return `${letter} (${pct}%)`;
    }
  }
}
