import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  PenLine,
  Sparkles,
  MessageSquareText,
  Target,
  Timer,
  FileText,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthNav } from "@/components/AuthNav";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Slate — AI Math Tutor for Tablets" },
      {
        name: "description",
        content:
          "Solve math by hand on your tablet while an AI tutor watches, hints, and guides you step by step — without ever just handing you the answer.",
      },
      { property: "og:title", content: "Slate — AI Math Tutor for Tablets" },
      {
        property: "og:description",
        content: "Handwrite your solution. Get real-time Socratic tutor feedback.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          Slate
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/progress" className="text-muted-foreground hover:text-foreground">
            Progress
          </Link>
          <Link to="/about" className="text-muted-foreground hover:text-foreground">
            How it works
          </Link>
          <ThemeToggle />
          <AuthNav />
          <Button asChild size="sm">
            <Link to="/tutor">Open tutor</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-10 py-14 lg:grid-cols-2 lg:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="size-3.5" /> A tutor that guides — not a solver that answers
            </span>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              Solve by hand. The&nbsp;tutor watches and guides you.
            </h1>
            <p className="mt-5 max-w-xl text-balance text-lg text-muted-foreground">
              Write your solution with a stylus. Slate reads your work in real time and
              nudges you the moment you go off track — one small Socratic hint at a time,
              so you actually learn it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link to="/tutor">
                  Start solving <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/about">See how it works</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Built for the Abitur, Baccalauréat, A-Levels &amp; IB · Works with any stylus · No account needed to try
            </p>
          </div>

          {/* Live-feel product preview */}
          <TutorPreview />
        </section>

        {/* How it works */}
        <section className="border-t py-16">
          <h2 className="text-center text-2xl font-semibold tracking-tight">
            How a Slate session feels
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                n: "1",
                icon: Sparkles,
                title: "Pick your exam",
                body: "Choose your exam — German Abitur, French Bac, A-Levels, IB, or general practice — and Slate generates problems in that exam's topics, style, and language.",
              },
              {
                n: "2",
                icon: PenLine,
                title: "Work it by hand",
                body: "Write naturally on a full canvas. Slate reads your handwriting as you go and tracks which step you're on.",
              },
              {
                n: "3",
                icon: MessageSquareText,
                title: "Get guided, not given",
                body: "Stuck? Pull hints one rung at a time — a nudge, then more, only as far as you need. The answer stays yours to find.",
              },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl border bg-card p-6">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {s.n}
                  </span>
                  <s.icon className="size-5 text-foreground" />
                </div>
                <h3 className="mt-4 font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Feature strip */}
        <section className="border-t py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: Target,
                title: "Step-by-step checkpoints",
                body: "Every problem breaks into goals you can see yourself complete.",
              },
              {
                icon: MessageSquareText,
                title: "Escalating hint ladder",
                body: "Nudge → hint → big hint → worked step. You control how much help.",
              },
              {
                icon: Timer,
                title: "Exam mode",
                body: "Timed, silent practice with a full critique when you're done.",
              },
              {
                icon: FileText,
                title: "Export & replay",
                body: "Save a session to PDF or replay your strokes stroke-by-stroke.",
              },
            ].map((f) => (
              <div key={f.title} className="rounded-2xl border bg-card p-6">
                <f.icon className="mb-3 size-5 text-foreground" />
                <h3 className="mb-1 font-medium">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="py-16">
          <div className="rounded-3xl border bg-card px-8 py-14 text-center">
            <h2 className="text-balance text-3xl font-semibold tracking-tight">
              Ready to actually learn the math?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground">
              Grab your tablet, pick a problem, and let the tutor guide your very next step.
            </p>
            <Button asChild size="lg" className="mt-7">
              <Link to="/tutor">
                Open the tutor <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        Slate · AI math tutor for tablets
      </footer>
    </div>
  );
}

/** A static, styled preview of the real tutor UI — handwriting, a Socratic hint,
 * and the checkpoint tracker — so visitors instantly get what Slate does. */
function TutorPreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/5 blur-2xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* checkpoint pills */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {[
            { label: "Identify a, b, c", state: "done" },
            { label: "Set up formula", state: "current" },
            { label: "Simplify", state: "pending" },
          ].map((p) => (
            <span
              key={p.label}
              className={
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium " +
                (p.state === "done"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : p.state === "current"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground")
              }
            >
              {p.state === "done" && <CheckCircle2 className="size-3" />}
              {p.label}
            </span>
          ))}
        </div>

        {/* handwriting canvas mock */}
        <div className="relative bg-white p-6" style={{ minHeight: 150 }}>
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)",
              backgroundSize: "22px 22px",
            }}
          />
          <svg viewBox="0 0 320 90" className="relative w-full" role="img" aria-label="Handwritten quadratic work">
            <g
              fill="none"
              stroke="#1e3a8a"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* x = */}
              <path d="M12 30 L26 52 M26 30 L12 52" />
              <path d="M38 38 h20 M38 46 h20" />
              {/* -b ± √... fraction */}
              <path d="M74 42 h150" />
              <path d="M96 22 h14" />
              <path d="M100 18 q10 6 0 12" />
              <path d="M120 30 q8 -12 16 0 q-8 12 -16 0" />
              <path d="M150 16 l8 16 l10 -22 h48" />
              <path d="M176 20 q10 4 2 10 M180 20 q-8 8 4 8" />
              <path d="M108 62 q10 -12 20 0 q-10 12 -20 0 M132 54 v16" />
            </g>
          </svg>
        </div>

        {/* tutor hint bubble */}
        <div className="space-y-2 border-t bg-muted/30 px-4 py-3">
          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Tutor
          </div>
          <div className="mr-8 rounded-lg rounded-tl-sm bg-muted px-3 py-2 text-sm">
            Nice — you've got the discriminant right. What goes in the denominator of the
            quadratic formula?
          </div>
          <div className="flex gap-2 pt-1">
            <span className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
              Need a nudge
            </span>
            <span className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground">
              Bigger hint
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
