import "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getModel, MODELS } from "@/lib/ai-provider";
import { generateJson } from "@/lib/ai-json";
import { guardAi } from "@/lib/api-guard";

const BodySchema = z.object({
  problem: z.string().min(1).max(2000),
  outline: z.string().max(4000).optional().default(""),
  examStyle: z.string().max(120).optional().default(""),
  language: z.string().max(20).optional().default("English"),
});

export const Route = createFileRoute("/api/mark-scheme")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const gate = await guardAi(request, 2);
          if (!gate.ok) return gate.response;

          const body = BodySchema.parse(await request.json());
          const model = getModel(MODELS.generate);

          const prompt = `You are an exam setter. Produce a concise mark scheme for this problem${
            body.examStyle ? ` in the style of ${body.examStyle}` : ""
          }.

Problem: ${body.problem}

Intended solution (private): ${body.outline}

Break the full solution into 4-8 marking criteria, each worth a small whole number of marks, separating METHOD marks (M — correct approach/steps) from ACCURACY/ANSWER marks (A — correct results). Write the descriptions in ${body.language}.

Respond as strict JSON, no prose, no code fences:
{
  "criteria": [
    { "code": "M1", "description": "short description of what earns this mark", "marks": 1 }
  ],
  "total": <sum of all marks>
}`;

          const json = await generateJson<{ criteria?: unknown[]; total?: number }>({ model, prompt });
          if (!json || !Array.isArray(json.criteria)) {
            return new Response("Couldn't build a mark scheme. Please try again.", { status: 502 });
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
