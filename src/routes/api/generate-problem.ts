import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getModel, MODELS } from "@/lib/ai-provider";
import { generateJson } from "@/lib/ai-json";
import { guardAi, aiErrorToResponse } from "@/lib/api-guard";

const BodySchema = z.object({
  topic: z.string().min(1).max(120),
  difficulty: z.enum(["easy", "medium", "hard"]),
  language: z.string().max(20).optional().default("English"),
  examStyle: z.string().max(300).optional().default(""),
  kind: z.enum(["solve", "graph"]).optional().default("solve"),
});

export const Route = createFileRoute("/api/generate-problem")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const gate = await guardAi(request, 2);
          if (!gate.ok) return gate.response;

          const body = BodySchema.parse(await request.json());
          const model = getModel(MODELS.generate);

          const styleLine = body.examStyle ? `\nStyle: ${body.examStyle}` : "";
          const prompt =
            body.kind === "graph"
              ? `Generate ONE ${body.difficulty} graph-sketching challenge on the topic "${body.topic}".${styleLine}

Ask the student to sketch a specific graph BY HAND — e.g. a function, its derivative, or a transformation. Write the "problem", "outline", and "steps" in ${body.language}; keep "latex" as pure math.

Respond as strict JSON, no prose, no code fences:
{
  "problem": "instruction telling the student exactly what to sketch, in ${body.language}",
  "latex": "the function/expression to sketch, as LaTeX (no $ delimiters)",
  "outline": "the KEY FEATURES a correct sketch must show — intercepts, turning points, asymptotes, end behaviour, overall shape — as one \\n-separated string, for grading only. Do NOT reveal.",
  "steps": ["3 to 6 short feature checkpoints in ${body.language}, e.g. 'x-intercepts at ±1'", "..."],
  "kind": "graph"
}`
              : `Generate ONE ${body.difficulty} difficulty math problem on the topic "${body.topic}".${styleLine}

Write the "problem" statement, the "outline", and every "steps" entry in ${body.language}. Keep "latex" as pure math (no language). Mathematical notation stays standard regardless of language.

Respond as strict JSON, no prose, no code fences:
{
  "problem": "plain text statement of the problem, in ${body.language}",
  "latex": "the problem rendered as a LaTeX string (no $ delimiters)",
  "outline": "a short bullet list (as one string with \\n separators) of the intended solution steps, for the tutor's internal use only. Do NOT reveal.",
  "steps": ["3 to 6 short, student-facing checkpoint goals in ${body.language}, each 2-6 words", "..."],
  "kind": "solve"
}`;

          const json = await generateJson({ model, prompt });
          if (!json) {
            return new Response("The tutor returned an unreadable problem. Please try again.", {
              status: 502,
            });
          }
          return Response.json(json);
        } catch (err) {
          return aiErrorToResponse(err);
        }
      },
    },
  },
});
