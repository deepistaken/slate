import { useCallback, useEffect, useState } from "react";
import {
  emptyProgress,
  loadProgress,
  recordSolve,
  recordMisconception,
  recordConfidence,
  recordMarkScore,
  setExamPlan,
  clearExamPlan,
  resetProgress,
  type Progress,
  type SolveInput,
} from "@/lib/progress";

/**
 * React access to Slate's learning record. Loads once on mount (client only, so
 * SSR renders the empty state), and exposes a `record` call that updates both
 * localStorage and component state so dashboards re-render immediately.
 */
export function useProgress() {
  const [progress, setProgress] = useState<Progress>(emptyProgress);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    setLoaded(true);
  }, []);

  const record = useCallback((input: SolveInput) => {
    setProgress(recordSolve(input));
  }, []);

  const noteMisconception = useCallback((tag: string) => {
    setProgress(recordMisconception(tag));
  }, []);

  const noteConfidence = useCallback((confidence: number, score: number) => {
    setProgress(recordConfidence(confidence, score));
  }, []);

  const noteMarkScore = useCallback((examId: string, pct: number) => {
    setProgress(recordMarkScore(examId, pct));
  }, []);

  const planExam = useCallback((examId: string, date: string) => {
    setProgress(setExamPlan(examId, date));
  }, []);

  const clearPlan = useCallback(() => {
    setProgress(clearExamPlan());
  }, []);

  const reset = useCallback(() => {
    setProgress(resetProgress());
  }, []);

  return {
    progress,
    loaded,
    record,
    noteMisconception,
    noteConfidence,
    noteMarkScore,
    planExam,
    clearPlan,
    reset,
  };
}
