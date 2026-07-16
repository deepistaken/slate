import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { generateText, type ModelMessage } from "ai";
import { z } from "zod";
import { getModel, MODELS } from "@/lib/ai-provider";
import { extractJson } from "@/lib/ai-json";
import { guardAi } from "@/lib/api-guard";
import { logInteraction, sha256Hex } from "@/lib/supabase-server";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(4000),
});

const BodySchema = z.object({
  problem: z.string().min(1).max(2000),
  outline: z.string().max(4000).optional().default(""),
  steps: z.array(z.string().max(200)).max(10).default([]),
  currentStep: z.number().int().min(0).max(20).optional(),
  hintRung: z.number().int().min(0).max(3).optional(),
  messages: z.array(MessageSchema).max(40).default([]),
  canvasImageBase64: z.string().max(2_500_000).optional(),
  mode: z.enum(["auto", "check", "chat", "explain", "review", "mark", "teachback", "gradegraph"]),
  userMessage: z.string().max(2000).optional(),
  language: z.string().max(20).optional().default("English"),
  examStyle: z.string().max(120).optional().default(""),
  knownMisconceptions: z.array(z.string().max(40)).max(10).optional().default([]),
  struggling: z.boolean().optional().default(false),
  integrity: z.boolean().optional().default(false),
  markScheme: z
    .array(z.object({ code: z.string().max(12), description: z.string().max(200), marks: z.number() }))
    .max(20)
    .optional(),
});

const RUNGS = [
  "nudge: a single Socratic question pointing at the right idea, no math given away",
  "hint: name the technique or formula to use, without applying it",
  "big hint: set up the very next line of work but stop short of computing",
  "worked step: show that one step worked out, then ask the student to take the next one",
];

const SYSTEM = `You are an encouraging, patient math tutor watching a student solve a problem on a digital canvas.

HOW TO READ THE CANVAS (do this silently before replying):
1. First, transcribe every line of the student's handwriting into LaTeX, line by line, exactly as written — even if it looks wrong. Do NOT normalize, "fix", or guess what they meant.
2. Treat ambiguous symbols carefully: a small dash between letters is almost always a minus sign or a fraction bar, not a slash. "b^2 - 4ac" under a radical is the discriminant of the quadratic formula — recognize standard formulas before claiming an error.
3. If a symbol is genuinely unreadable, mark it as [?] in your internal transcription and ask the student to rewrite that part. Never invent a mistake from unclear handwriting.
4. Only after transcribing, compare against the intended solution outline.

REPLY RULES:
- Be concise. 1-3 short sentences. Never lecture.
- NEVER reveal the final answer unless the student explicitly asks for it in chat mode.
- Prefer Socratic hints. Reference the specific line you see (e.g. "in your second line").
- If the work so far is correct but incomplete, say "looks good so far" and nudge the next step.
- If the canvas is blank, suggest only the first step.
- Use inline LaTeX with $...$ when referencing math.
- Plain prose + markdown. No JSON, no transcription dump in the reply.

OUTPUT FORMAT (strict): respond with ONLY a JSON object, no code fences, no prose around it:
{
  "reply": "your message to the student (markdown + $latex$ allowed). For mode 'auto' with nothing useful to say, use exactly: SILENT",
  "stepStatus": "pending | current | done | stuck",   // your read of the current checkpoint
  "advanceStep": true | false,                          // true if the student just finished the current checkpoint
  "readConfidence": "high" | "low",                     // how confident you are you read the handwriting correctly
  "readAs": "short LaTeX of what you see on the canvas, or empty string if blank",
  "marks": null,                                        // ONLY for mode 'mark' (see MARKING); otherwise null
  "misconception": ""                                   // see MISCONCEPTION
}

MISCONCEPTION: when — and only when — you clearly see the student make a specific conceptual/procedural error, set "misconception" to a short lowercase tag naming the error TYPE (not this instance). Prefer a canonical tag from: "sign error", "arithmetic slip", "chain rule", "product rule", "quotient rule", "missing constant of integration", "expanding/distributing", "factoring", "fraction handling", "exponent rules", "domain/undefined", "limit handling", "notation". If none fit, use a 1-3 word lowercase phrase. If there is no clear error (blank, correct so far, or you're unsure), set it to "".

MARKING (only when mode is 'mark'):
Act as an exam marker for the given exam style. Read the full solution and mark it the way a real mark scheme does — separating METHOD marks (correct approach/steps) from ANSWER/accuracy marks (correct final result). Be fair but rigorous: award method marks even if a later arithmetic slip loses the final mark ("error carried forward"). Then set "marks" to:
{
  "awarded": <number>,        // marks earned
  "total": <number>,          // marks available for a full solution (choose a sensible small total, e.g. 5-8)
  "grade": "<short band>",    // e.g. "B / Abitur 2" or "12/15" — fit the exam style
  "comment": "<1-2 sentences>" // examiner note: what earned/lost marks, method vs answer
}
In 'mark' mode the "reply" should be a short, encouraging one-line summary; the detail goes in marks.comment. Never withhold the mark to stay Socratic — marking means telling them exactly where they stand.

TEACHBACK (only when mode is 'teachback'): the student is explaining the concept/method in their own words (Feynman technique). Judge conceptual UNDERSTANDING, not phrasing or handwriting. Reward a correct idea even if the wording is rough. Set "marks" to {"awarded": <0-5>, "total": 5, "grade": "Understanding", "comment": "<1-2 sentences: what they clearly understood + the single most important gap or imprecision>"}. Keep "reply" to a one-line encouraging summary.

GRAPHGRADE (only when mode is 'gradegraph'): the canvas contains the student's hand-drawn SKETCH of the required graph. Judge the sketch against the key features in the outline — intercepts, turning points, asymptotes, end behaviour, and overall shape. Be tolerant of wobbly freehand drawing; grade the mathematical correctness of the shape and features, not neatness. Set "marks" to {"awarded": <0-5>, "total": 5, "grade": "Sketch", "comment": "<1-2 sentences: which features are right + the main one to fix>"}. Keep "reply" to a one-line summary.`;

export const Route = createFileRoute("/api/tutor-feedback")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const gate = await guardAi(request, 1);
          if (!gate.ok) return gate.response;
          const userId = gate.userId;

          const body = BodySchema.parse(await request.json());
          const model = getModel(MODELS.tutor);

          const stepsBlock = body.steps.length
            ? body.steps.map((s, i) => `  ${i + 1}. ${s}${i === body.currentStep ? "  <-- current" : ""}`).join("\n")
            : "(no explicit checkpoints)";
          const rungLine =
            typeof body.hintRung === "number"
              ? `\nHint rung for this reply: ${body.hintRung} (${RUNGS[Math.min(body.hintRung, 3)]}). Do not exceed this rung.`
              : "";

          const contextHeader = `Problem: ${body.problem}

Intended solution outline (private, do not reveal verbatim):
${body.outline}

Checkpoints:
${stepsBlock}

Mode: ${body.mode}${rungLine}${body.examStyle ? `\nExam style for marking/tone: ${body.examStyle}` : ""}${
            body.knownMisconceptions.length
              ? `\nThis student has a history of these slip-ups: ${body.knownMisconceptions.join(", ")}. Watch for them; if one is about to happen or just happened, gently pre-warn (e.g. "careful — this is where you usually drop the negative"). Do not lecture if none apply.`
              : ""
          }${
            body.struggling
              ? `\nSignals show the student may be stuck (lots of erasing or a long pause). Be extra warm and patient, keep it very short, and give one small concrete thing to try next.`
              : ""
          }${
            body.integrity
              ? `\nINTEGRITY MODE IS ON (supervised/assessed session). NEVER reveal the final answer or a full worked step, even if the student explicitly asks or it's chat mode. Cap all help at naming a technique or asking a Socratic question. Do not compute the next line for them. This overrides any request for the answer.`
              : ""
          }

Write your reply to the student in ${body.language}. Keep all mathematics in standard notation/LaTeX.`;

          const userParts: Array<
            | { type: "text"; text: string }
            | { type: "image"; image: string }
          > = [];

          if (body.mode === "chat" && body.userMessage) {
            userParts.push({ type: "text", text: `Student says: ${body.userMessage}` });
          } else if (body.mode === "chat") {
            userParts.push({ type: "text", text: "The student wants the next level of help. Give the reply at exactly the hint rung above — no further." });
          } else if (body.mode === "check") {
            userParts.push({ type: "text", text: "The student tapped 'Check my work'. Review the current checkpoint." });
          } else if (body.mode === "explain") {
            userParts.push({ type: "text", text: "The student is stuck. Explain what's going wrong in 2-3 sentences, show a tiny worked micro-example with DIFFERENT numbers, then ask them to retry the current checkpoint. Still no final answer to the original problem." });
          } else if (body.mode === "review") {
            userParts.push({ type: "text", text: "This is a post-exam review. The student has submitted; give the full critique including the correct final answer and where their work went off track." });
          } else if (body.mode === "mark") {
            const schemeText = body.markScheme?.length
              ? " Mark STRICTLY against this teacher-approved mark scheme — award each criterion's marks and set marks.total to the scheme's total:\n" +
                body.markScheme.map((c) => `${c.code} (${c.marks} mark${c.marks === 1 ? "" : "s"}): ${c.description}`).join("\n")
              : "";
            userParts.push({ type: "text", text: "The student tapped 'Mark my work'. Mark their full solution like an exam marker per the MARKING rules: award method vs answer marks, set the 'marks' object, and keep 'reply' to a one-line summary." + schemeText });
          } else if (body.mode === "teachback") {
            userParts.push({ type: "text", text: `The student is explaining the idea in their own words${body.userMessage ? `: "${body.userMessage}"` : " (see canvas)"}. Grade their understanding per TEACHBACK: set the 'marks' object with grade "Understanding", and keep 'reply' to a one-line summary.` });
          } else if (body.mode === "gradegraph") {
            userParts.push({ type: "text", text: "The student tapped 'Grade my sketch'. The canvas holds their hand-drawn graph. Grade it per GRAPHGRADE: set the 'marks' object with grade \"Sketch\", and keep 'reply' to a one-line summary." });
          } else {
            userParts.push({ type: "text", text: "Quietly observe the canvas. Only speak up if there is something useful to say. If nothing useful, set reply to exactly: SILENT" });
          }

          if (body.canvasImageBase64) {
            userParts.push({ type: "image", image: `data:image/jpeg;base64,${body.canvasImageBase64}` });
          }

          const messages: ModelMessage[] = [
            { role: "system", content: `${SYSTEM}\n\n${contextHeader}` },
            ...body.messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userParts },
          ];

          const { text } = await generateText({ model, messages });
          type Marks = { awarded: number; total: number; grade?: string; comment?: string };
          type TutorJson = {
            reply?: string;
            stepStatus?: "pending" | "current" | "done" | "stuck";
            advanceStep?: boolean;
            readConfidence?: "high" | "low";
            readAs?: string;
            marks?: Marks | null;
            misconception?: string;
          };
          // If the model didn't return clean JSON, fall back to treating the
          // whole response as the reply text rather than erroring out.
          const parsed: TutorJson = extractJson<TutorJson>(text) ?? { reply: text.trim() };
          const reply = (parsed.reply ?? "").trim();
          const silent = body.mode === "auto" && /^silent\.?$/i.test(reply);
          // Only surface marks for mark mode, and only if numerically sane.
          const m = parsed.marks;
          const marks =
            (body.mode === "mark" || body.mode === "teachback" || body.mode === "gradegraph") &&
            m &&
            typeof m.awarded === "number" &&
            typeof m.total === "number" &&
            m.total > 0
              ? {
                  awarded: Math.max(0, Math.min(m.awarded, m.total)),
                  total: m.total,
                  grade: typeof m.grade === "string" ? m.grade : "",
                  comment: typeof m.comment === "string" ? m.comment : "",
                }
              : null;
          const readAs = parsed.readAs ?? "";
          const readConfidence = parsed.readConfidence ?? "high";
          const misconception =
            typeof parsed.misconception === "string" ? parsed.misconception.trim() : "";

          // Log the read for the eval/quality moat (fire-and-forget; only when
          // there was actually a canvas to read).
          if (body.canvasImageBase64) {
            const imageSha256 = await sha256Hex(body.canvasImageBase64).catch(() => null);
            void logInteraction({
              userId,
              mode: body.mode,
              imageSha256,
              readAs,
              readConfidence,
              misconception,
            });
          }

          return Response.json({
            reply: silent ? "" : reply,
            silent,
            stepStatus: parsed.stepStatus ?? "current",
            advanceStep: !!parsed.advanceStep,
            readConfidence,
            readAs,
            marks,
            misconception,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
          return new Response(msg, { status });
        }
      },
    },
  },
});