## Goal

Make Slate feel like a real tutor and a real study session: guided step-by-step coaching plus tools to review and share work.

---

## Part 1 — Smarter tutoring

### 1a. Step checkpoints
- When a problem is generated, also ask the model for an ordered `steps[]` array (3–6 short checkpoints, each `{ goal, expectedSignal }`).
- Add a vertical Checkpoint Tracker above the canvas toolbar: pill per step, states `pending / current / done / stuck`.
- `tutor-feedback` returns `currentStep` and `stepStatus`. The auto-watch loop advances the tracker; "Check my work" forces a re-evaluation.
- Tutor replies are scoped to the current step ("Focus on isolating x first") instead of evaluating the whole page.

### 1b. Hint ladder
- Replace the single tutor reply with a 4-rung ladder per checkpoint: `nudge → hint → big hint → worked step`.
- UI: after a tutor message, show a "Need more help?" button that requests the next rung. Rung level resets when the student advances a step.
- Server passes the current rung to the model so it never jumps straight to the answer.

### 1c. Mistake explainer
- When `stepStatus === "stuck"` or the model flags an error, show an "Explain my mistake" button on that message.
- Calls `tutor-feedback` with `mode: "explain"` — returns a focused mini-lesson: what went wrong, why, a 2-line worked micro-example with different numbers, then asks the student to retry.

### 1d. Handwriting confidence
- `tutor-feedback` returns `readConfidence: "high" | "low"` and `readAs` (LaTeX of what it saw).
- When low: tutor asks for a rewrite instead of guessing, and the chat bubble shows "I read this as: …" so the student can correct it.

---

## Part 2 — Study tools

### 2a. Export session to PDF
- "Export" button in header. Generates a single PDF with: problem (rendered LaTeX), canvas snapshot(s), tutor chat transcript, checkpoint summary.
- Client-side using `jspdf` + `html2canvas` (canvas snapshot already available via `exportJpeg`). No backend needed.

### 2b. Exam mode
- Toggle in header. While on:
  - Tutor auto-watch disabled, chat disabled, hint ladder hidden.
  - Timer in header (student sets minutes when starting).
  - Each problem gets a "Submit" button; canvas snapshot is captured at submit time.
- When timer ends or student submits all: switch to Review screen — for each problem show the snapshot + a full tutor critique (mode: `review`, all hints allowed, includes final answer).
- Works with the existing PDF problem list: turns a worksheet into a timed practice exam.

### 2c. Shareable replay
- Record canvas strokes (already in memory) + chat messages + checkpoint timeline into a JSON blob.
- "Share" button downloads a `.slate.json` file and opens a `/replay` route that accepts a file upload and plays back strokes on a read-only canvas with a scrubber and synced chat.
- No persistence/cloud needed for v1; file-based sharing keeps it offline-friendly.

---

## Files

**New**
- `src/components/CheckpointTracker.tsx`
- `src/components/HintLadder.tsx` (rung buttons under tutor messages)
- `src/components/ExamModeBar.tsx` (timer + submit)
- `src/lib/session-export.ts` (PDF export)
- `src/lib/session-replay.ts` (serialize/deserialize replay blob)
- `src/routes/replay.tsx`

**Edited**
- `src/routes/api/generate-problem.ts` — also return `steps[]`
- `src/routes/api/tutor-feedback.ts` — accept `currentStep`, `hintRung`, `mode: "explain" | "review"`; return `currentStep`, `stepStatus`, `readConfidence`, `readAs`
- `src/components/HandwritingCanvas.tsx` — expose `getStrokes()` / `loadStrokes()` for replay
- `src/routes/tutor.tsx` — wire all of the above (tracker, ladder, exam toggle, export, share)

**Deps**
- `jspdf`, `html2canvas`

---

## Out of scope (next round)
- Adaptive difficulty, progress dashboard, accounts (needs Lovable Cloud).
- Graph paper / function plotter / OCR preview overlay.
- Teacher mode / assigned problem sets.

Want me to also fold in graph paper + a math-aware OCR preview while I'm in the canvas, or keep this round tight?
