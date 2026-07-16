import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Flame,
  Trophy,
  Target,
  ArrowRight,
  RotateCcw,
  Sparkles,
  AlertTriangle,
  Gauge,
  CalendarClock,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useProgress } from "@/hooks/use-progress";
import {
  levelForXp,
  weakestSkills,
  recommendedDifficulty,
  setPendingPractice,
  topMisconceptions,
  calibrationSummary,
  daysUntil,
  predictedScore,
} from "@/lib/progress";
import { EXAMS, getExam, findExamForTopic, gradeForExam } from "@/lib/exams";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Your progress — Slate" },
      { name: "description", content: "Track your math mastery, streak, and weak spots." },
    ],
  }),
  component: ProgressPage,
});

function masteryLabel(m: number): string {
  if (m >= 0.85) return "Mastered";
  if (m >= 0.6) return "Strong";
  if (m >= 0.3) return "Getting there";
  if (m > 0) return "Just started";
  return "Not started";
}

function barColor(m: number): string {
  if (m >= 0.85) return "bg-emerald-500";
  if (m >= 0.6) return "bg-lime-500";
  if (m >= 0.3) return "bg-amber-500";
  if (m > 0) return "bg-orange-500";
  return "bg-muted-foreground/30";
}

function ProgressPage() {
  const { progress, loaded, reset, planExam, clearPlan } = useProgress();
  const navigate = useNavigate();
  const [planExamId, setPlanExamId] = useState(EXAMS[0].id);
  const [planDate, setPlanDate] = useState("");

  const plan = progress.examPlan;
  const planDays = plan ? daysUntil(plan.date) : null;
  const planExamObj = plan ? getExam(plan.examId) : null;
  const focus = weakestSkills(progress)
    .filter((s) => s.stat.mastery < 0.85)
    .slice(0, 3);

  // Predicted grade — for the planned exam, else whichever has the most marking data.
  const predictExamId =
    plan?.examId ??
    Object.entries(progress.examScores).sort((a, b) => b[1].count - a[1].count)[0]?.[0] ??
    null;
  const prediction = predictExamId
    ? predictedScore(progress, predictExamId, getExam(predictExamId).topics)
    : null;
  const predictedGrade =
    predictExamId && prediction ? gradeForExam(predictExamId, prediction.score) : null;
  const { level, intoLevel, span } = levelForXp(progress.xp);
  const practiced = weakestSkills(progress);
  const weakest = practiced.find((s) => s.stat.mastery < 0.85) ?? practiced[0] ?? null;
  const started = practiced.length > 0;

  const practiceSkill = (skill: string, mastery: number) => {
    const owningExam = findExamForTopic(skill);
    setPendingPractice({
      examId: owningExam?.id,
      topic: skill,
      difficulty: recommendedDifficulty(mastery),
    });
    navigate({ to: "/tutor" });
  };

  const slipUps = topMisconceptions(progress, 6);
  const cal = calibrationSummary(progress);

  const practicedList = Object.entries(progress.skills)
    .map(([skill, stat]) => ({ skill, stat }))
    .sort((a, b) => {
      const ea = findExamForTopic(a.skill)?.label ?? "~";
      const eb = findExamForTopic(b.skill)?.label ?? "~";
      if (ea !== eb) return ea.localeCompare(eb);
      return a.stat.mastery - b.stat.mastery;
    });

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Slate
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link to="/tutor">Open tutor</Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-4xl px-6 pb-20">
        <h1 className="text-3xl font-semibold tracking-tight">Your progress</h1>
        <p className="mt-2 text-muted-foreground">
          Every solve builds your mastery. Keep your streak alive and chip away at your weak spots.
        </p>

        {/* Exam countdown coach */}
        <section className="mt-8">
          {plan && planExamObj && planDays !== null ? (
            <div className="rounded-2xl border bg-primary/5 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className="size-6 shrink-0 text-primary" />
                  <div>
                    <div className="text-xl font-semibold">
                      {planDays > 0
                        ? `${planDays} day${planDays === 1 ? "" : "s"} to your ${planExamObj.label}`
                        : planDays === 0
                          ? `Your ${planExamObj.label} is today — you've got this!`
                          : `${planExamObj.label} was ${-planDays} day${-planDays === 1 ? "" : "s"} ago`}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {new Date(plan.date + "T00:00:00").toLocaleDateString(undefined, {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <button
                  onClick={clearPlan}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                >
                  Change
                </button>
              </div>
              {planDays > 0 && focus.length > 0 && (
                <div className="mt-4 border-t border-primary/10 pt-4">
                  <div className="text-sm font-medium">Today's focus — your weakest spots</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {focus.map((f) => (
                      <button
                        key={f.skill}
                        onClick={() => practiceSkill(f.skill, f.stat.mastery)}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-muted"
                      >
                        {f.skill}
                        <ArrowRight className="size-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="size-4 text-primary" /> Set your exam date
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Get a countdown and a daily focus built from your weak spots.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={planExamId}
                  onChange={(e) => setPlanExamId(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  {EXAMS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="rounded-md border bg-background px-2 py-1.5 text-sm"
                />
                <Button size="sm" disabled={!planDate} onClick={() => planDate && planExam(planExamId, planDate)}>
                  Set countdown
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Predicted grade */}
        {predictedGrade && prediction && predictExamId && (
          <section className="mt-6">
            <div className="flex flex-col justify-between gap-3 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-3">
                <GraduationCap className="size-6 shrink-0 text-primary" />
                <div>
                  <div className="text-sm text-muted-foreground">
                    Predicted grade · {getExam(predictExamId).label}
                  </div>
                  <div className="text-2xl font-semibold">{predictedGrade}</div>
                </div>
              </div>
              <p className="max-w-sm text-xs text-muted-foreground sm:text-right">
                Estimated from {prediction.markCount} marked attempt
                {prediction.markCount === 1 ? "" : "s"} plus your topic mastery. Mark more solutions
                and lift your weak topics to raise it.
              </p>
            </div>
          </section>
        )}

        {/* Top stats */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Flame className="size-4 text-orange-500" /> Day streak
            </div>
            <div className="mt-2 text-3xl font-semibold">{progress.streakCount}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {progress.streakCount > 0 ? "Solve one problem today to keep it." : "Solve a problem to start one."}
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Trophy className="size-4 text-amber-500" /> Problems solved
            </div>
            <div className="mt-2 text-3xl font-semibold">{progress.totalSolved}</div>
            <p className="mt-1 text-xs text-muted-foreground">across all topics</p>
          </div>
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="size-4 text-primary" /> Level {level}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.round((intoLevel / span) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {intoLevel} / {span} XP to level {level + 1}
            </p>
          </div>
        </div>

        {/* Weakest-skill callout */}
        {loaded && started && weakest && (
          <div className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border bg-primary/5 p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <Target className="mt-0.5 size-5 text-primary" />
              <div>
                <div className="text-sm font-medium">Focus next: {weakest.skill}</div>
                <p className="text-sm text-muted-foreground">
                  This is your weakest area right now ({Math.round(weakest.stat.mastery * 100)}% mastery).
                  A few clean solves will lift it fast.
                </p>
              </div>
            </div>
            <Button className="shrink-0" onClick={() => practiceSkill(weakest.skill, weakest.stat.mastery)}>
              Practice it <ArrowRight className="ml-1 size-4" />
            </Button>
          </div>
        )}

        {/* Confidence calibration */}
        {cal && (
          <section className="mt-10">
            <div className="flex items-start gap-3 rounded-2xl border bg-card p-5">
              <Gauge className="mt-0.5 size-5 text-primary" />
              <div>
                <div className="text-sm font-medium">Confidence: {cal.label}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {cal.bias > 0.15
                    ? `Your work scores about ${Math.round(cal.bias * 100)}% lower than how sure you feel — double-check before you commit on the exam.`
                    : cal.bias < -0.15
                      ? `You score about ${Math.round(-cal.bias * 100)}% higher than you expect — trust yourself a bit more.`
                      : "Your confidence closely matches how you actually score. That's exactly what you want going into an exam."}
                  {` Based on ${cal.samples} marked attempts.`}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Recurring error types the tutor keeps catching */}
        {slipUps.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-medium">Your common slip-ups</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Slate remembers these and watches for them while you work.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {slipUps.map((s) => (
                <span
                  key={s.tag}
                  className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm"
                >
                  <AlertTriangle className="size-3.5 text-amber-500" />
                  {s.tag}
                  <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
                    {s.count}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Per-skill mastery — every topic you've practiced, across all exams */}
        {practicedList.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-medium">Mastery by topic</h2>
            <div className="mt-4 space-y-3">
              {practicedList.map(({ skill, stat }) => {
                const m = stat.mastery;
                const owningExam = findExamForTopic(skill);
                return (
                  <div key={skill} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{skill}</span>
                        {owningExam && (
                          <span className="ml-2 text-xs text-muted-foreground">{owningExam.label}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="text-muted-foreground">
                          {masteryLabel(m)}
                          {stat.solved ? ` · ${stat.solved} solved` : ""}
                        </span>
                        <button
                          onClick={() => practiceSkill(skill, m)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          Practice
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${barColor(m)}`}
                        style={{ width: `${Math.max(m * 100, m > 0 ? 6 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!started && loaded && (
          <div className="mt-8 rounded-2xl border border-dashed bg-card p-8 text-center">
            <p className="text-muted-foreground">
              No solves yet. Open the tutor, work a problem to completion, and watch your mastery grow here.
            </p>
            <Button asChild className="mt-4">
              <Link to="/tutor">
                Start solving <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        )}

        {started && (
          <div className="mt-10 border-t pt-6">
            <button
              onClick={() => {
                if (confirm("Reset all progress? This can't be undone.")) reset();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" /> Reset progress
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
