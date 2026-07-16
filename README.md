# Slate — AI math tutor for tablets

Handwrite your math on a tablet; Slate reads your work, coaches you Socratically
(without just giving the answer), marks it like a real examiner, and tracks your
mastery toward a specific exam.

## Features

- **Handwriting-native tutor** — solve by hand; the AI reads the canvas and gives
  escalating Socratic hints (nudge → hint → big hint → worked step) tied to
  step checkpoints.
- **Exam presets** — German Abitur, French Baccalauréat, A-Level, IB, or general
  practice, with problems generated in each exam's topics, style, and language.
- **Examiner-style marking** — method vs. answer marks in the exam's own grading
  system, with a grade band and comment. Teachers can review and edit the mark
  scheme (teacher tools).
- **Mastery engine** — per-skill mastery, adaptive difficulty, Smart Practice,
  predicted grade, streaks, and a progress dashboard.
- **Misconception memory** — remembers recurring error types and pre-warns you.
- **Confidence calibration**, **teach-it-back**, **exam-date countdown coach**,
  **struggle detection from ink**, **draw-the-graph challenges**.
- **Integrity mode** — no answers + a tamper-evident (SHA-256) work log for
  supervised/assessed use.
- Exam mode (timed), PDF worksheet import, session PDF export, stroke replay.

## Stack

- React + TanStack Start, deployed on Cloudflare Workers (Wrangler)
- Google Gemini API (vision) via `@ai-sdk/google`
- Tailwind CSS

## Getting started

```bash
npm install
```

Create a `.dev.vars` file in the project root (git-ignored):

```
GOOGLE_GENERATIVE_AI_API_KEY=your-key   # free key: https://aistudio.google.com/apikey
```

Then:

```bash
npm run dev      # local dev server
npm run build    # production build
```

For production, set the key as a Cloudflare secret:

```bash
npx wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY
```

## Roadmap

Accounts + cloud persistence, metered billing and abuse controls, and a schools
tier (classes, assignments, teacher dashboard, LMS/LTI integration) are the next
milestones — see `STARTUP_ROADMAP.md`.

## License

Proprietary — all rights reserved.
