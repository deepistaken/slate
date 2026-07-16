import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getModel, MODELS } from "@/lib/ai-provider";
import { generateJson } from "@/lib/ai-json";
import { guardAi } from "@/lib/api-guard";

const BodySchema = z.object({
  text: z.string().min(1).max(60000),
});

export const Route = createFileRoute("/api/extract-problems")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const gate = await guardAi(request, 3);
          if (!gate.ok) return gate.response;

          const body = BodySchema.parse(await request.json());
          const model = getModel(MODELS.generate);

          const prompt = `Below is raw text extracted from a math worksheet PDF. Identify every distinct math problem/exercise the student is asked to solve. Skip instructions, headers, answer keys, page numbers.

Return strict JSON, no prose, no code fences:
{
  "problems": [
    { "problem": "plain text statement", "latex": "LaTeX form without $ delimiters", "outline": "short \\n-separated bullets of intended solution steps, tutor-only", "steps": ["3-6 short student-facing checkpoint goals, 2-6 words each"] }
  ]
}

If a problem already has multiple parts (a), (b), (c), keep them together as one entry. Limit to at most 20 problems.

PDF TEXT:
"""
${body.text.slice(0, 50000)}
"""`;

          const json = await generateJson<{ problems?: unknown[] }>({ model, prompt });
          if (!json) {
            return new Response("Couldn't read the worksheet. Please try again.", { status: 502 });
          }
          return Response.json(json);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
          return new Response(msg, { status });
        }
      },
    },
  },
});