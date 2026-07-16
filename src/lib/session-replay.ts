import type { Stroke } from "@/components/HandwritingCanvas";

export type ReplayBlob = {
  version: 1;
  createdAt: number;
  problem: { problem: string; latex: string; outline: string; steps?: string[] };
  strokes: Stroke[];
  messages: Array<{ role: "user" | "assistant"; content: string }>;
};

export function downloadReplay(blob: ReplayBlob, filename = "slate-session.slate.json") {
  const data = new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readReplayFile(file: File): Promise<ReplayBlob> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (parsed?.version !== 1 || !Array.isArray(parsed.strokes)) {
    throw new Error("Not a valid Slate replay file");
  }
  return parsed as ReplayBlob;
}