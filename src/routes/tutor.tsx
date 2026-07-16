import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Pen,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Send,
  Loader2,
  CheckCircle2,
  Sparkles,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Upload,
  FileText,
  Download,
  Share2,
  AlertCircle,
  Flame,
  Trophy,
  Wand2,
  Award,
  GraduationCap,
  CalendarClock,
  LineChart,
  Shield,
  ShieldCheck,
  FileCheck2,
  School,
  ClipboardList,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { HandwritingCanvas, type CanvasHandle } from "@/components/HandwritingCanvas";
import { MathMarkdown } from "@/components/MathMarkdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthNav } from "@/components/AuthNav";
import { CheckpointTracker, type StepStatus } from "@/components/CheckpointTracker";
import { HintLadder } from "@/components/HintLadder";
import { ExamModeBar } from "@/components/ExamModeBar";
import { createRecognizer, speak, stopSpeaking, type SpeechRecognitionLike } from "@/lib/speech";
import { exportSessionPdf } from "@/lib/session-export";
import { downloadReplay } from "@/lib/session-replay";
import { useProgress } from "@/hooks/use-progress";
import { useAuth } from "@/lib/auth";
import { callAi, NotAuthenticatedError } from "@/lib/ai-client";
import { saveSession } from "@/lib/user-data";
import {
  loadProgress,
  pickNextSkill,
  recommendedDifficulty,
  consumePendingPractice,
  topMisconceptions,
  daysUntil,
} from "@/lib/progress";
import { EXAMS, getExam, DEFAULT_EXAM_ID } from "@/lib/exams";
import {
  getIntegrityMode,
  setIntegrityMode,
  buildAndDownloadIntegrityReport,
} from "@/lib/integrity";
import {
  getTeacherMode,
  setTeacherMode,
  loadScheme,
  saveScheme,
  clearScheme,
  normalizeScheme,
  schemeTotal,
  type MarkScheme,
  type Criterion,
} from "@/lib/markscheme";

export const Route = createFileRoute("/tutor")({
  head: () => ({
    meta: [
      { title: "Tutor — Slate" },
      { name: "description", content: "Solve math problems with a live AI tutor." },
    ],
  }),
  component: Tutor,
});

type Problem = { problem: string; latex: string; outline: string; steps?: string[]; kind?: "solve" | "graph" };
type Marks = { awarded: number; total: number; grade: string; comment: string };
type ChatMsg = {
  role: "user" | "assistant";
  content: string;
  rung?: number;
  step?: number;
  stuck?: boolean;
  readAs?: string;
  lowConfidence?: boolean;
  marks?: Marks | null;
};
type Submission = { problem: Problem; snapshot: string; review?: string };

function Tutor() {
  const { configured: authConfigured, loading: authLoading, user: authUser } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef<CanvasHandle>(null);
  const [tool, setTool] = useState<"pen" | "eraser">("pen");
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(3);

  const [examId, setExamId] = useState(DEFAULT_EXAM_ID);
  const exam = getExam(examId);
  const TOPICS = exam.topics;
  const [topic, setTopic] = useState(getExam(DEFAULT_EXAM_ID).topics[1]);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Switching exams swaps the topic list to that exam's curriculum.
  const changeExam = (id: string) => {
    const next = getExam(id);
    setExamId(id);
    setTopic(next.topics[0]);
  };
  const [problem, setProblem] = useState<Problem | null>(null);
  const [generating, setGenerating] = useState(false);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);

  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([]);

  const [examActive, setExamActive] = useState(false);
  const [examEndsAt, setExamEndsAt] = useState<number | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [reviewing, setReviewing] = useState(false);

  const [pdfProblems, setPdfProblems] = useState<Problem[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { progress, record, noteMisconception, noteConfidence, noteMarkScore } = useProgress();
  const watchOuts = topMisconceptions(progress, 3);
  const [confidencePrompt, setConfidencePrompt] = useState(false);
  const [teachbackMode, setTeachbackMode] = useState(false);
  const [struggleOffer, setStruggleOffer] = useState(false);
  const [integrityMode, setIntegrity] = useState(false);
  const [teacherMode, setTeacher] = useState(false);
  const [scheme, setScheme] = useState<MarkScheme | null>(null);
  const [schemeOpen, setSchemeOpen] = useState(false);
  const [schemeLoading, setSchemeLoading] = useState(false);

  const inflightRef = useRef(false);
  const lastAutoRef = useRef(0);
  const solvedRef = useRef(false);
  const hintsUsedRef = useRef(0);
  const pendingConfidenceRef = useRef<number | null>(null);
  const struggleOfferedRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => setIntegrity(getIntegrityMode()), []);
  useEffect(() => setTeacher(getTeacherMode()), []);

  const toggleTeacher = () => {
    setTeacher((v) => {
      const next = !v;
      setTeacherMode(next);
      toast.info(next ? "Teacher tools on." : "Teacher tools off.");
      return next;
    });
  };

  const toggleIntegrity = () => {
    setIntegrity((v) => {
      const next = !v;
      setIntegrityMode(next);
      toast.info(next ? "Integrity mode on — no answers, work is logged." : "Integrity mode off.");
      return next;
    });
  };

  const onIntegrityExport = async () => {
    if (!problem) {
      toast.error("Generate a problem first.");
      return;
    }
    const strokes = canvasRef.current?.getStrokes() ?? [];
    await buildAndDownloadIntegrityReport({
      examLabel: getExam(examId).label,
      problem: { problem: problem.problem, latex: problem.latex },
      strokes,
      messages: messages.map(({ role, content }) => ({ role, content })),
      hintsUsed: hintsUsedRef.current,
    });
    toast.success("Integrity report downloaded.");
  };

  // --- teacher-editable mark scheme ---
  const fetchScheme = useCallback(async () => {
    if (!problem) return;
    setSchemeLoading(true);
    try {
      const ex = getExam(examId);
      const res = await callAi("/api/mark-scheme", {
        problem: problem.problem,
        outline: problem.outline,
        examStyle: ex.label,
        language: ex.language,
      });
      if (!res.ok) {
        handleApiError(res.status, await res.text());
        return;
      }
      const norm = normalizeScheme(await res.json());
      if (norm) setScheme(norm);
      else toast.error("Couldn't read the mark scheme.");
    } catch (e) {
      handleThrown(e, "Failed to load mark scheme");
    } finally {
      setSchemeLoading(false);
    }
  }, [problem, examId]);

  const openScheme = () => {
    setSchemeOpen(true);
    if (!scheme) void fetchScheme();
  };
  const saveSchemeNow = () => {
    if (!problem || !scheme) return;
    saveScheme(problem.problem, scheme);
    setSchemeOpen(false);
    toast.success("Mark scheme saved — marking now uses your version.");
  };
  const resetScheme = () => {
    if (problem) clearScheme(problem.problem);
    setScheme(null);
    void fetchScheme();
  };
  const updateCriterion = (i: number, patch: Partial<Criterion>) => {
    setScheme((s) => {
      if (!s) return s;
      const criteria = s.criteria.map((c, idx) => (idx === i ? { ...c, ...patch } : c));
      return { criteria, total: schemeTotal(criteria) };
    });
  };
  const addCriterion = () => {
    setScheme((s) => {
      const criteria = [...(s?.criteria ?? []), { code: "", description: "", marks: 1 }];
      return { criteria, total: schemeTotal(criteria) };
    });
  };
  const removeCriterion = (i: number) => {
    setScheme((s) => {
      if (!s) return s;
      const criteria = s.criteria.filter((_, idx) => idx !== i);
      return { criteria, total: schemeTotal(criteria) };
    });
  };

  const goToLogin = useCallback(() => {
    navigate({ to: "/login", search: { redirect: "/tutor" } });
  }, [navigate]);

  const handleApiError = (status: number, text: string) => {
    if (status === 401 || status === 503) {
      toast.error(text || "Please sign in to keep practicing.");
      goToLogin();
    } else if (status === 429) toast.error(text || "You've hit today's limit. Try again tomorrow.");
    else if (status === 402) toast.error("AI credits exhausted. Add credits in Workspace settings.");
    else toast.error(text || `Request failed (${status})`);
  };

  // Turn a thrown error into the right UX: redirect on auth loss, toast otherwise.
  const handleThrown = useCallback(
    (e: unknown, fallback: string) => {
      if (e instanceof NotAuthenticatedError) {
        toast.error("Please sign in to keep practicing.");
        goToLogin();
        return;
      }
      toast.error(e instanceof Error ? e.message : fallback);
    },
    [goToLogin],
  );

  const initProblem = (p: Problem) => {
    setProblem(p);
    setMessages([]);
    const n = p.steps?.length ?? 0;
    setCurrentStep(0);
    setStepStatuses(n ? (["current", ...Array(n - 1).fill("pending")] as StepStatus[]) : []);
    solvedRef.current = false;
    hintsUsedRef.current = 0;
    struggleOfferedRef.current = false;
    setStruggleOffer(false);
    setScheme(loadScheme(p.problem));
    setSchemeOpen(false);
    canvasRef.current?.clear();
    canvasRef.current?.markClean();
  };

  const generateProblem = useCallback(async (override?: { topic?: string; difficulty?: "easy" | "medium" | "hard"; examId?: string; kind?: "solve" | "graph" }) => {
    const useTopic = override?.topic ?? topic;
    const useDifficulty = override?.difficulty ?? difficulty;
    const useExam = getExam(override?.examId ?? examId);
    setGenerating(true);
    try {
      const res = await callAi("/api/generate-problem", {
        topic: useTopic,
        difficulty: useDifficulty,
        language: useExam.language,
        examStyle: useExam.styleNote ?? "",
        kind: override?.kind ?? "solve",
      });
      if (!res.ok) {
        handleApiError(res.status, await res.text());
        return;
      }
      const data = (await res.json()) as Problem;
      initProblem(data);
    } catch (e) {
      handleThrown(e, "Failed to generate problem");
    } finally {
      setGenerating(false);
    }
  }, [topic, difficulty, examId]);

  // Adaptive: pick the weakest topic in the current exam at the right difficulty.
  const smartPractice = useCallback(() => {
    const p = loadProgress();
    const nextTopic = pickNextSkill(p, TOPICS);
    const nextDifficulty = recommendedDifficulty(p.skills[nextTopic]?.mastery ?? 0);
    setTopic(nextTopic);
    setDifficulty(nextDifficulty);
    toast.info(`Smart practice: ${nextTopic} · ${nextDifficulty}`);
    void generateProblem({ topic: nextTopic, difficulty: nextDifficulty });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generateProblem, TOPICS]);

  // Honor a "Practice it" request handed off from the progress dashboard.
  useEffect(() => {
    const pending = consumePendingPractice();
    if (pending) {
      if (pending.examId) changeExam(pending.examId);
      setTopic(pending.topic);
      setDifficulty(pending.difficulty);
      void generateProblem({
        topic: pending.topic,
        difficulty: pending.difficulty,
        examId: pending.examId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const callTutor = useCallback(
    async (
      mode: "auto" | "check" | "chat" | "explain" | "mark" | "teachback" | "gradegraph",
      opts: { userMessage?: string; hintRung?: number } = {},
    ) => {
      if (!problem) return;
      if (inflightRef.current) return;
      inflightRef.current = true;
      if (mode !== "auto") setSending(true);
      try {
        const img = canvasRef.current?.exportJpeg(0.94, 2100) ?? undefined;
        const inkStats = canvasRef.current?.getInkStats();
        const struggling =
          !!inkStats && (inkStats.eraserCount >= 3 || inkStats.sinceLastMs > 25000);
        const res = await callAi("/api/tutor-feedback", {
          problem: problem.problem,
          outline: problem.outline,
          steps: problem.steps ?? [],
          currentStep,
          hintRung: opts.hintRung,
          messages: messages.slice(-12).map(({ role, content }) => ({ role, content })),
          canvasImageBase64: img,
          mode,
          userMessage: opts.userMessage,
          language: getExam(examId).language,
          examStyle: getExam(examId).label,
          knownMisconceptions: topMisconceptions(loadProgress(), 5).map((x) => x.tag),
          struggling,
          integrity: integrityMode,
          markScheme: mode === "mark" && scheme ? scheme.criteria : undefined,
        });
        if (!res.ok) {
          handleApiError(res.status, await res.text());
          return;
        }
        const data = (await res.json()) as {
          reply: string;
          silent: boolean;
          stepStatus: StepStatus;
          advanceStep: boolean;
          readConfidence: "high" | "low";
          readAs: string;
          marks: Marks | null;
          misconception: string;
        };
        canvasRef.current?.markClean();
        if (data.misconception) noteMisconception(data.misconception);
        if (mode === "mark" && data.marks) {
          const score = data.marks.total > 0 ? data.marks.awarded / data.marks.total : 0;
          noteMarkScore(examId, score);
          if (pendingConfidenceRef.current != null) {
            noteConfidence(pendingConfidenceRef.current, score);
            pendingConfidenceRef.current = null;
          }
        }

        // Update checkpoint statuses (with felt feedback on progress).
        // Marking, teach-back and sketch-grading don't touch the checkpoint tracker.
        if (problem.steps?.length && mode !== "mark" && mode !== "teachback" && mode !== "gradegraph") {
          const total = problem.steps.length;
          const isLast = currentStep >= total - 1;
          if (data.advanceStep && isLast) {
            // Final checkpoint cleared — celebrate once per problem.
            setStepStatuses((prev) => {
              const next = [...prev];
              next[currentStep] = "done";
              return next;
            });
            if (!solvedRef.current) {
              solvedRef.current = true;
              record({ skill: topic, difficulty, hintsUsed: hintsUsedRef.current });
              const clean = hintsUsedRef.current === 0;
              toast.success(
                clean
                  ? "Solved with no hints! 🎉 That's mastery — streak updated."
                  : "Solved! 🎉 Every checkpoint complete — streak updated.",
                { duration: 5000 },
              );
            }
          } else if (data.advanceStep) {
            // Advanced to the next checkpoint.
            const cleared = problem.steps[currentStep];
            setStepStatuses((prev) => {
              const next = [...prev];
              next[currentStep] = "done";
              next[currentStep + 1] = "current";
              return next;
            });
            setCurrentStep((s) => s + 1);
            toast.success(cleared ? `Step done: ${cleared}` : "Step complete — on to the next.");
          } else {
            setStepStatuses((prev) => {
              const next = [...prev];
              if (next[currentStep]) next[currentStep] = data.stepStatus;
              return next;
            });
          }
        }

        if (data.silent || (!data.reply && !data.marks)) return;
        setMessages((m) => {
          const next: ChatMsg[] = [...m];
          if ((mode === "chat" || mode === "teachback") && opts.userMessage) {
            next.push({ role: "user", content: opts.userMessage });
          }
          next.push({
            role: "assistant",
            content: data.reply,
            rung: opts.hintRung,
            step: currentStep,
            stuck: data.stepStatus === "stuck",
            readAs: data.readAs,
            lowConfidence: data.readConfidence === "low",
            marks: data.marks,
          });
          return next;
        });
        if (speakReplies) speak(data.reply);
      } catch (e) {
        if (mode !== "auto") handleThrown(e, "Tutor failed");
      } finally {
        inflightRef.current = false;
        if (mode !== "auto") setSending(false);
      }
    },
    [problem, messages, speakReplies, currentStep, topic, difficulty, record, examId, noteMisconception, noteConfidence, noteMarkScore, integrityMode, scheme],
  );

  // Auto-snapshot loop (disabled in exam mode)
  useEffect(() => {
    if (!problem || !autoCheck || examActive) return;
    const id = setInterval(() => {
      const now = Date.now();
      if (now - lastAutoRef.current < 10000) return;
      if (!canvasRef.current?.isDirty()) return;
      lastAutoRef.current = now;
      callTutor("auto");
    }, 2000);
    return () => clearInterval(id);
  }, [problem, autoCheck, callTutor, examActive]);

  // Proactive struggle detection from ink telemetry (erasing / long pause).
  useEffect(() => {
    if (!problem || examActive) return;
    const id = setInterval(() => {
      if (struggleOfferedRef.current || sending || solvedRef.current) return;
      const stats = canvasRef.current?.getInkStats();
      if (!stats || stats.strokeCount < 2) return;
      if (stats.eraserCount >= 3 || stats.sinceLastMs > 25000) {
        struggleOfferedRef.current = true;
        setStruggleOffer(true);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [problem, examActive, sending]);

  const sendChat = () => {
    const t = chatInput.trim();
    if (!t) return;
    setChatInput("");
    if (teachbackMode) {
      setTeachbackMode(false);
      callTutor("teachback", { userMessage: t });
    } else {
      callTutor("chat", { userMessage: t });
    }
  };

  const askMore = (nextRung: number) => {
    hintsUsedRef.current += 1;
    // Integrity mode caps help below the "worked step" rung.
    callTutor("chat", { hintRung: integrityMode ? Math.min(nextRung, 2) : nextRung });
  };

  const askExplain = () => {
    hintsUsedRef.current += 1;
    callTutor("explain");
  };

  // Capture how confident the student is, then mark — so Slate can calibrate.
  const submitMark = (confidence: number) => {
    pendingConfidenceRef.current = confidence;
    setConfidencePrompt(false);
    callTutor("mark");
  };

  const toggleMic = () => {
    if (listening) {
      recognizerRef.current?.stop();
      return;
    }
    const rec = createRecognizer();
    if (!rec) {
      toast.error("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }
    recognizerRef.current = rec;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        // In teach-back, drop the transcript into the box so they can review/send it.
        if (teachbackMode) setChatInput(transcript);
        else if (problem) callTutor("chat", { userMessage: transcript });
        else setChatInput(transcript);
      }
    };
    rec.onerror = (e) => {
      if (e.error !== "aborted" && e.error !== "no-speech") {
        toast.error(`Mic error: ${e.error}`);
      }
    };
    rec.onend = () => setListening(false);
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const onPdfPicked = async (file: File) => {
    setPdfLoading(true);
    setPdfName(file.name);
    setPdfProblems([]);
    try {
      const { extractPdfText } = await import("@/lib/pdf");
      const text = await extractPdfText(file);
      if (!text.trim()) {
        toast.error("No selectable text found in that PDF.");
        return;
      }
      const res = await callAi("/api/extract-problems", { text });
      if (!res.ok) {
        handleApiError(res.status, await res.text());
        return;
      }
      const data = (await res.json()) as { problems: Problem[] };
      setPdfProblems(data.problems ?? []);
      if (!data.problems?.length) toast.error("Couldn't find any problems in that PDF.");
    } catch (e) {
      handleThrown(e, "Failed to read PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const pickPdfProblem = (p: Problem) => {
    stopSpeaking();
    initProblem(p);
  };

  // Exam mode
  const startExam = (minutes: number) => {
    setExamActive(true);
    setReviewing(false);
    setSubmissions([]);
    setExamEndsAt(Date.now() + minutes * 60_000);
    toast.success(`Exam started — ${minutes} min. Hints are off.`);
  };
  const stopExam = () => {
    setExamActive(false);
    setExamEndsAt(null);
    setSubmissions([]);
    setReviewing(false);
  };
  const submitCurrent = () => {
    if (!problem) return;
    const snap = canvasRef.current?.exportJpeg(0.85, 1400);
    if (!snap) return;
    setSubmissions((s) => [...s, { problem, snapshot: snap }]);
    toast.success("Submitted. Pick or generate the next problem.");
    canvasRef.current?.clear();
    canvasRef.current?.markClean();
    setProblem(null);
  };
  useEffect(() => {
    if (!examActive || !examEndsAt) return;
    const id = setInterval(() => {
      if (Date.now() >= examEndsAt) {
        setExamActive(false);
        setExamEndsAt(null);
        setReviewing(true);
        toast.info("Time's up — generating review.");
      }
    }, 1000);
    return () => clearInterval(id);
  }, [examActive, examEndsAt]);

  const finishExamNow = () => {
    setExamActive(false);
    setExamEndsAt(null);
    setReviewing(true);
  };

  // Generate reviews when entering review mode
  useEffect(() => {
    if (!reviewing) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < submissions.length; i++) {
        if (submissions[i].review) continue;
        try {
          const sub = submissions[i];
          const res = await callAi("/api/tutor-feedback", {
            problem: sub.problem.problem,
            outline: sub.problem.outline,
            steps: sub.problem.steps ?? [],
            messages: [],
            canvasImageBase64: sub.snapshot,
            mode: "review",
            language: getExam(examId).language,
          });
          if (!res.ok) continue;
          const data = (await res.json()) as { reply: string };
          if (cancelled) return;
          setSubmissions((prev) => {
            const next = [...prev];
            next[i] = { ...next[i], review: data.reply };
            return next;
          });
        } catch {
          // skip
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reviewing, submissions]);

  // Export & Share
  const onExport = () => {
    if (!problem) {
      toast.error("Generate a problem first.");
      return;
    }
    const img = canvasRef.current?.exportJpeg(0.9, 1600);
    exportSessionPdf({
      problemText: problem.problem,
      problemLatex: problem.latex,
      canvasImageDataUrl: img ? `data:image/jpeg;base64,${img}` : undefined,
      messages: messages.map(({ role, content }) => ({ role, content })),
      steps: problem.steps,
      stepStatuses,
    });
  };
  const onShare = () => {
    if (!problem) {
      toast.error("Generate a problem first.");
      return;
    }
    const strokes = canvasRef.current?.getStrokes() ?? [];
    downloadReplay({
      version: 1,
      createdAt: Date.now(),
      problem,
      strokes,
      messages: messages.map(({ role, content }) => ({ role, content })),
    });
    toast.success("Replay file downloaded. Open it at /replay to play back.");
  };

  // Find the latest assistant message for ladder controls
  const lastAssistantIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }
    return -1;
  })();
  const lastAssistant = lastAssistantIdx >= 0 ? messages[lastAssistantIdx] : null;

  // --- Login gate: the tutor makes metered AI calls, so it requires an account.
  if (authConfigured && !authLoading && !authUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to practice</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Slate saves your progress and history to your account. Sign in or create a free account
            to start.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button asChild>
              <Link to="/login" search={{ redirect: "/tutor" }}>
                Sign in
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/">Back home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <Toaster richColors position="top-center" />
      <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-base font-semibold tracking-tight">
            Slate
          </Link>
          <span className="text-xs text-muted-foreground">AI math tutor</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/progress"
            title="Your progress"
            className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
          >
            <span className="flex items-center gap-1 text-orange-600 dark:text-orange-400">
              <Flame className="size-3.5" />
              {progress.streakCount}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Trophy className="size-3.5" />
              {progress.totalSolved}
            </span>
            {progress.examPlan &&
              (() => {
                const d = daysUntil(progress.examPlan.date);
                return d >= 0 ? (
                  <span className="flex items-center gap-1 text-primary" title="Days to your exam">
                    <CalendarClock className="size-3.5" />
                    {d}d
                  </span>
                ) : null;
              })()}
          </Link>
          <ThemeToggle />
          <AuthNav />
          <ExamModeBar
            active={examActive}
            endsAt={examEndsAt}
            onStart={startExam}
            onStop={stopExam}
            onSubmit={submitCurrent}
            canSubmit={!!problem}
          />
          {examActive && submissions.length > 0 && (
            <Button size="sm" variant="outline" onClick={finishExamNow}>
              Finish ({submissions.length})
            </Button>
          )}
          <Button
            variant={teacherMode ? "default" : "outline"}
            size="icon"
            onClick={toggleTeacher}
            title={teacherMode ? "Teacher tools ON" : "Turn on teacher tools (edit mark schemes)"}
          >
            <School className="size-4" />
          </Button>
          <Button
            variant={integrityMode ? "default" : "outline"}
            size="icon"
            onClick={toggleIntegrity}
            title={integrityMode ? "Integrity mode ON — no answers, work logged" : "Turn on integrity mode (supervised, no answers)"}
          >
            {integrityMode ? <ShieldCheck className="size-4" /> : <Shield className="size-4" />}
          </Button>
          {integrityMode && (
            <Button variant="outline" size="icon" onClick={onIntegrityExport} title="Export tamper-evident integrity report">
              <FileCheck2 className="size-4" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={onExport} title="Export session to PDF">
            <Download className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={onShare} title="Download shareable replay">
            <Share2 className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPdfPicked(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={pdfLoading}>
            {pdfLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
            Upload PDF
          </Button>
          <Select value={examId} onValueChange={changeExam}>
            <SelectTrigger className="w-[190px]" title="Choose your exam">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXAMS.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={topic} onValueChange={setTopic}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TOPICS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={difficulty} onValueChange={(v) => setDifficulty(v as "easy" | "medium" | "hard")}>
            <SelectTrigger className="w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="easy">Easy</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="hard">Hard</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={smartPractice} disabled={generating} title="Auto-pick your weakest topic at the right difficulty">
            <Wand2 className="mr-2 size-4" />
            Smart practice
          </Button>
          <Button variant="outline" onClick={() => generateProblem({ kind: "graph" })} disabled={generating} title="Generate a graph to sketch by hand">
            <LineChart className="mr-2 size-4" />
            Graph challenge
          </Button>
          <Button onClick={() => generateProblem()} disabled={generating}>
            {generating ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}
            {problem ? "New problem" : "Generate"}
          </Button>
        </div>
      </header>

      {reviewing ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Exam review</h2>
              <Button variant="outline" onClick={stopExam}>Done</Button>
            </div>
            {submissions.length === 0 && (
              <p className="text-sm text-muted-foreground">No submissions in this session.</p>
            )}
            {submissions.map((sub, i) => (
              <div key={i} className="space-y-3 rounded-xl border bg-background p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Problem {i + 1}
                </div>
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <MathMarkdown>{`$$${sub.problem.latex}$$`}</MathMarkdown>
                </div>
                <img
                  src={`data:image/jpeg;base64,${sub.snapshot}`}
                  alt={`Work for problem ${i + 1}`}
                  className="w-full rounded-md border"
                />
                <div className="rounded-md bg-muted p-3 text-sm">
                  {sub.review ? (
                    <MathMarkdown>{sub.review}</MathMarkdown>
                  ) : (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Tutor reviewing…
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[280px_minmax(0,1fr)_340px]">
          {/* Problem panel */}
          <aside className="min-w-0 overflow-y-auto rounded-xl border bg-background p-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Problem
            </h2>
            {problem ? (
              <div className="mt-3 space-y-3">
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <MathMarkdown>{`$$${problem.latex}$$`}</MathMarkdown>
                </div>
                <p className="text-sm text-muted-foreground">{problem.problem}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Pick a topic and difficulty above, then tap Generate.
              </p>
            )}

            {(pdfName || pdfProblems.length > 0) && (
              <div className="mt-6">
                <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <FileText className="size-3" /> {pdfName ?? "PDF problems"}
                </h2>
                {pdfLoading ? (
                  <p className="mt-3 text-sm text-muted-foreground">Reading PDF…</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {pdfProblems.map((p, i) => (
                      <li key={i}>
                        <button
                          onClick={() => pickPdfProblem(p)}
                          className={`w-full rounded-md border px-2 py-2 text-left text-xs hover:bg-muted/50 ${
                            problem?.problem === p.problem ? "border-primary bg-muted/40" : ""
                          }`}
                        >
                          <span className="mr-1 font-semibold">{i + 1}.</span>
                          <span className="line-clamp-2">{p.problem}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>

          {/* Canvas */}
          <main className="flex min-h-0 min-w-0 flex-col gap-2">
            {problem?.steps?.length ? (
              <div className="rounded-xl border bg-background p-2">
                <CheckpointTracker
                  steps={problem.steps}
                  statuses={stepStatuses}
                  onSelect={(i) => setCurrentStep(i)}
                />
              </div>
            ) : null}
            {problem && watchOuts.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs">
                <span className="flex items-center gap-1 font-medium text-amber-700 dark:text-amber-300">
                  <AlertCircle className="size-3.5" /> Your usual slip-ups:
                </span>
                {watchOuts.map((w) => (
                  <span
                    key={w.tag}
                    className="rounded-full border border-amber-500/30 px-2 py-0.5 text-amber-700 dark:text-amber-300"
                  >
                    {w.tag}
                    {w.count > 1 ? ` ×${w.count}` : ""}
                  </span>
                ))}
              </div>
            )}
            <div className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border bg-background p-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={tool === "pen" ? "default" : "outline"}
                  onClick={() => setTool("pen")}
                >
                  <Pen className="mr-1 size-4" /> Pen
                </Button>
                <Button
                  size="sm"
                  variant={tool === "eraser" ? "default" : "outline"}
                  onClick={() => setTool("eraser")}
                >
                  <Eraser className="mr-1 size-4" /> Eraser
                </Button>
                <div className="mx-1 h-6 w-px shrink-0 bg-border" />
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-8 shrink-0 cursor-pointer rounded border"
                  aria-label="Pen color"
                />
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-24 min-w-0"
                  aria-label="Pen size"
                />
                <div className="mx-1 h-6 w-px shrink-0 bg-border" />
                <Button size="sm" variant="outline" onClick={() => canvasRef.current?.undo()}>
                  <Undo2 className="size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => canvasRef.current?.redo()}>
                  <Redo2 className="size-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => canvasRef.current?.clear()}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 xl:justify-end">
                <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={autoCheck && !examActive}
                    disabled={examActive}
                    onChange={(e) => setAutoCheck(e.target.checked)}
                  />
                  Auto-watch
                </label>
                <Button
                  size="sm"
                  onClick={() => callTutor("check")}
                  disabled={!problem || sending || examActive}
                  className="w-full justify-center sm:w-auto sm:min-w-[9.5rem]"
                >
                  {sending ? (
                    <Loader2 className="mr-1 size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 size-4" />
                  )}
                  Check my work
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfidencePrompt(true)}
                  disabled={!problem || sending || examActive || confidencePrompt}
                  className="w-full justify-center sm:w-auto"
                  title="Grade my full solution like an exam marker"
                >
                  <Award className="mr-1 size-4" />
                  Mark my work
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTeachbackMode(true)}
                  disabled={!problem || sending || examActive || teachbackMode}
                  className="w-full justify-center sm:w-auto"
                  title="Explain the idea in your own words and get scored on understanding"
                >
                  <GraduationCap className="mr-1 size-4" />
                  Teach it back
                </Button>
                {problem?.kind === "graph" && (
                  <Button
                    size="sm"
                    onClick={() => callTutor("gradegraph")}
                    disabled={!problem || sending || examActive}
                    className="w-full justify-center sm:w-auto"
                    title="Grade my hand-drawn graph"
                  >
                    <LineChart className="mr-1 size-4" />
                    Grade my sketch
                  </Button>
                )}
                {teacherMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={openScheme}
                    disabled={!problem}
                    className="w-full justify-center sm:w-auto"
                    title="Review and edit the mark scheme used for grading"
                  >
                    <ClipboardList className="mr-1 size-4" />
                    Mark scheme
                    {scheme ? ` (${scheme.total})` : ""}
                  </Button>
                )}
              </div>
            </div>
            {confidencePrompt && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2 text-sm">
                <span className="text-muted-foreground">Before I mark — how sure are you it's right?</span>
                <Button size="sm" variant="outline" onClick={() => submitMark(0.35)}>
                  Not sure
                </Button>
                <Button size="sm" variant="outline" onClick={() => submitMark(0.67)}>
                  Fairly sure
                </Button>
                <Button size="sm" variant="outline" onClick={() => submitMark(1)}>
                  Very sure
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfidencePrompt(false)}>
                  Cancel
                </Button>
              </div>
            )}
            {struggleOffer && !teachbackMode && !confidencePrompt && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2 text-sm">
                <span className="text-amber-700 dark:text-amber-300">
                  This step looks tricky — want a hand?
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setStruggleOffer(false);
                    callTutor("check");
                  }}
                >
                  Give me a nudge
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setStruggleOffer(false)}>
                  I'm good
                </Button>
              </div>
            )}
            {teachbackMode && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-2 text-sm">
                <GraduationCap className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 text-muted-foreground">
                  Teach-back: explain the method in your own words in the chat box (type or use the mic), then send — I'll score your understanding.
                </span>
                <Button size="sm" variant="ghost" onClick={() => setTeachbackMode(false)}>
                  Cancel
                </Button>
              </div>
            )}
            {schemeOpen && teacherMode && (
              <div className="rounded-xl border bg-background p-3 text-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <ClipboardList className="size-4 text-primary" /> Mark scheme
                    <span className="text-xs font-normal text-muted-foreground">
                      total {scheme?.total ?? 0}
                    </span>
                  </div>
                  <button onClick={() => setSchemeOpen(false)} className="rounded p-1 hover:bg-muted">
                    <X className="size-4" />
                  </button>
                </div>
                {schemeLoading ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Building mark scheme…
                  </p>
                ) : scheme ? (
                  <div className="space-y-2">
                    {scheme.criteria.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          value={c.code}
                          onChange={(e) => updateCriterion(i, { code: e.target.value })}
                          className="w-14 shrink-0 rounded border bg-background px-2 py-1 text-xs"
                          placeholder="M1"
                        />
                        <input
                          value={c.description}
                          onChange={(e) => updateCriterion(i, { description: e.target.value })}
                          className="min-w-0 flex-1 rounded border bg-background px-2 py-1 text-xs"
                          placeholder="What earns this mark"
                        />
                        <input
                          type="number"
                          min={0}
                          value={c.marks}
                          onChange={(e) => updateCriterion(i, { marks: Number(e.target.value) })}
                          className="w-14 shrink-0 rounded border bg-background px-2 py-1 text-xs"
                        />
                        <button
                          onClick={() => removeCriterion(i)}
                          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                          title="Remove"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={addCriterion}>
                        <Plus className="mr-1 size-3.5" /> Add
                      </Button>
                      <Button size="sm" variant="ghost" onClick={resetScheme}>
                        Regenerate from AI
                      </Button>
                      <div className="flex-1" />
                      <Button size="sm" onClick={saveSchemeNow}>
                        Save scheme
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">No mark scheme loaded.</p>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1">
              <HandwritingCanvas ref={canvasRef} tool={tool} color={color} size={size} />
            </div>
          </main>

          {/* Chat */}
          <aside className="flex min-h-0 min-w-0 flex-col rounded-xl border bg-background">
            <div className="flex items-center justify-between border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Tutor{examActive ? " (off — exam mode)" : ""}</span>
              <button
                onClick={() => {
                  if (speakReplies) stopSpeaking();
                  setSpeakReplies((v) => !v);
                }}
                className="flex items-center gap-1 rounded px-2 py-1 hover:bg-muted"
                title={speakReplies ? "Mute spoken replies" : "Speak replies aloud"}
              >
                {speakReplies ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
                {speakReplies ? "Voice on" : "Voice off"}
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {examActive
                    ? "Tutor is silent during exam mode. Use Submit when finished."
                    : "The tutor will speak up when there's something useful to say. You can also ask anything below."}
                </p>
              ) : (
                messages.map((m, i) => (
                  <div key={i}>
                    <div
                      className={
                        m.role === "user"
                          ? "ml-6 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                          : "mr-6 rounded-lg bg-muted px-3 py-2 text-sm"
                      }
                    >
                      {m.role === "assistant" ? <MathMarkdown>{m.content}</MathMarkdown> : m.content}
                    </div>
                    {m.role === "assistant" && m.lowConfidence && m.readAs && (
                      <div className="mr-6 mt-1 flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                        <AlertCircle className="size-3 shrink-0" />
                        <span className="flex items-center gap-1">
                          I read this as:
                          <MathMarkdown>{`$${m.readAs}$`}</MathMarkdown>
                          — rewrite if wrong.
                        </span>
                      </div>
                    )}
                    {m.role === "assistant" && m.marks && (
                      <div className="mr-6 mt-1 rounded-lg border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-sm font-semibold">
                            <Award className="size-4 text-primary" />
                            {m.marks.awarded}/{m.marks.total} marks
                          </div>
                          {m.marks.grade && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              {m.marks.grade}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${Math.round((m.marks.awarded / m.marks.total) * 100)}%` }}
                          />
                        </div>
                        {m.marks.comment && (
                          <p className="mt-2 text-xs text-muted-foreground">{m.marks.comment}</p>
                        )}
                      </div>
                    )}
                    {!examActive && i === lastAssistantIdx && lastAssistant && (
                      <div className="mr-6">
                        <HintLadder
                          rung={lastAssistant.rung ?? 0}
                          onMore={askMore}
                          onExplain={askExplain}
                          showExplain={!!lastAssistant.stuck}
                          disabled={sending}
                        />
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 border-t p-2">
              <Button
                type="button"
                variant={listening ? "default" : "outline"}
                size="icon"
                onClick={toggleMic}
                title={listening ? "Stop listening" : "Hold-to-talk"}
                disabled={sending || examActive}
                className="shrink-0"
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
              <Input
                className="min-w-0"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                placeholder={
                  examActive
                    ? "Chat disabled during exam"
                    : teachbackMode
                      ? "Explain the method in your own words…"
                      : listening
                        ? "Listening…"
                        : problem
                          ? "Ask or tap the mic…"
                          : "Generate a problem first"
                }
                disabled={!problem || sending || examActive}
              />
              <Button
                onClick={sendChat}
                disabled={!problem || sending || examActive || !chatInput.trim()}
                className="shrink-0"
              >
                <Send className="size-4" />
              </Button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}