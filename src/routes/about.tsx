import { createFileRoute, Link } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Slate AI Math Tutor" },
      {
        name: "description",
        content: "How Slate works, what it does well today, and what's coming next.",
      },
    ],
  }),
  component: About,
});

function About() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <ThemeToggle />
      </div>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight">About Slate</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Slate is an AI math tutor designed for tablets. You solve problems by hand
        on a canvas; the tutor watches and gives you short hints the moment you
        need them.
      </p>

      <h2 className="mt-10 text-xl font-semibold">How it works</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted-foreground">
        <li>Pick a topic and difficulty. The tutor generates a problem.</li>
        <li>Write your solution on the canvas with a stylus or finger.</li>
        <li>Every few seconds the tutor takes a quick look at your canvas.</li>
        <li>You get a short hint only when something is worth saying.</li>
        <li>Ask anything in the chat — "give me a hint", "am I right?".</li>
      </ol>

      <h2 className="mt-10 text-xl font-semibold">Honest limitations (v1)</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>Handwriting reading depends on a vision model — messy work may be misread.</li>
        <li>No voice yet. Push-to-talk + spoken replies are next.</li>
        <li>No accounts. Nothing is saved between sessions.</li>
        <li>Best on a tablet with a stylus.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Coming next</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
        <li>Voice conversation with the tutor</li>
        <li>Upload worksheets and PDFs to solve next to them</li>
        <li>Accounts, saved sessions, and weak-area tracking</li>
        <li>More subjects: physics, discrete math, proofs</li>
      </ul>
    </div>
  );
}