import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getModel, MODELS } from "@/lib/ai-provider";
import { generateJson } from "@/lib/ai-json";
import { guardAi, aiErrorToResponse } from "@/lib/api-guard";

const BodySchema = z.object({
  text: z.string().min(1).max(60000).optional(),
  // Per-page text; lets the model report which page each problem is on so the
  // client can show the matching page screenshot.
  pages: z.array(z.string().max(20000)).min(1).max(40).optional(),
});

export const Route = createFileRoute("/api/extract-problems")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const gate = await guardAi(request, 3);
          if (!gate.ok) return gate.response;

          const body = BodySchema.parse(await request.json());
          if (!body.text && !body.pages) {
            return new Response("Provide `text` or `pages`.", { status: 400 });
          }
          const model = getModel(MODELS.generate);

          const sourceText = body.pages
            ? body.pages
                .map(
                  (t, i) =>
                    `[PAGE ${i + 1}]\n` +
                    t
                      .split("\n")
                      .map((line, n) => `${n + 1}: ${line}`)
                      .join("\n"),
                )
                .join("\n\n")
            : body.text!;

          const prompt = `Below is raw text extracted from a math worksheet PDF${body.pages ? ", with [PAGE n] markers and numbered lines" : ""}. Identify every distinct math problem/exercise the student is asked to solve. Skip instructions, headers, answer keys, page numbers.

Return strict JSON, no prose, no code fences:
{
  "problems": [
    { "problem": "plain text statement", "latex": "LaTeX form without $ delimiters", "outline": "short \\n-separated bullets of intended solution steps, tutor-only", "steps": ["3-6 short student-facing checkpoint goals, 2-6 words each"], "page": 1, "startLine": 4, "endLine": 9 }
  ]
}

"page" is the 1-based page number the problem appears on ([PAGE n] markers). "startLine"/"endLine" are the 1-based numbered lines on that page where the problem's printed text starts and ends (inclusive — include every sub-part and any diagram caption lines between them). If there are no page markers or line numbers, omit these three fields.

If a problem already has multiple parts (a), (b), (c), keep them together as one entry. Limit to at most 20 problems.

PDF TEXT:
"""
${sourceText.slice(0, 50000)}
"""`;

          const json = await generateJson<{ problems?: unknown[] }>({ model, prompt });
          if (!json) {
            return new Response("Couldn't read the worksheet. Please try again.", { status: 502 });
          }
          return Response.json(json);
        } catch (err) {
          return aiErrorToResponse(err);
        }
      },
    },
  },
});
