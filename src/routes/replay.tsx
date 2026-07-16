import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Upload, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HandwritingCanvas, type CanvasHandle, type Stroke } from "@/components/HandwritingCanvas";
import { MathMarkdown } from "@/components/MathMarkdown";
import { ThemeToggle } from "@/components/ThemeToggle";
import { readReplayFile, type ReplayBlob } from "@/lib/session-replay";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "Replay — Slate" },
      { name: "description", content: "Play back a saved Slate study session." },
    ],
  }),
  component: ReplayPage,
});

function ReplayPage() {
  const canvasRef = useRef<CanvasHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<ReplayBlob | null>(null);
  const [progress, setProgress] = useState(0); // 0..1
  const [playing, setPlaying] = useState(false);

  const totalStrokes = blob?.strokes.length ?? 0;

  useEffect(() => {
    if (!blob || !canvasRef.current) return;
    const count = Math.round(progress * totalStrokes);
    const partial = blob.strokes.slice(0, count) as Stroke[];
    canvasRef.current.setStrokes(partial);
  }, [blob, progress, totalStrokes]);

  useEffect(() => {
    if (!playing || !blob) return;
    const id = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(1, p + 1 / Math.max(totalStrokes, 1));
        if (next >= 1) setPlaying(false);
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [playing, blob, totalStrokes]);

  const onPick = async (file: File) => {
    try {
      const b = await readReplayFile(file);
      setBlob(b);
      setProgress(0);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not read file");
    }
  };

  const shownMessages = blob
    ? blob.messages.slice(0, Math.ceil(progress * blob.messages.length))
    : [];

  return (
    <div className="flex h-screen flex-col bg-muted/30">
      <header className="flex items-center justify-between border-b bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-base font-semibold">Slate</Link>
          <span className="text-xs text-muted-foreground">Session replay</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 size-4" /> Load .slate.json
          </Button>
        </div>
      </header>

      {!blob ? (
        <div className="grid flex-1 place-items-center p-6 text-center text-sm text-muted-foreground">
          Load a saved session to play it back.
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 lg:grid-cols-[280px_1fr_320px]">
          <aside className="overflow-y-auto rounded-xl border bg-background p-4">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Problem</h2>
            <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
              <MathMarkdown>{`$$${blob.problem.latex}$$`}</MathMarkdown>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{blob.problem.problem}</p>
          </aside>

          <main className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-2 rounded-xl border bg-background p-2">
              <Button size="sm" variant="outline" onClick={() => setPlaying((v) => !v)}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProgress(0);
                  setPlaying(false);
                }}
              >
                <RotateCcw className="size-4" />
              </Button>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(progress * 1000)}
                onChange={(e) => setProgress(Number(e.target.value) / 1000)}
                className="flex-1"
              />
              <span className="w-16 text-right font-mono text-xs text-muted-foreground">
                {Math.round(progress * 100)}%
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <HandwritingCanvas ref={canvasRef} tool="pen" color="#000" size={3} readOnly />
            </div>
          </main>

          <aside className="flex min-h-0 flex-col rounded-xl border bg-background">
            <div className="border-b px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Chat
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {shownMessages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-6 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                      : "mr-6 rounded-lg bg-muted px-3 py-2 text-sm"
                  }
                >
                  {m.role === "assistant" ? <MathMarkdown>{m.content}</MathMarkdown> : m.content}
                </div>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}