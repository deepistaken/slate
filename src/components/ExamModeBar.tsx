import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Timer, Play, Square, Send } from "lucide-react";

type Props = {
  active: boolean;
  endsAt: number | null;
  onStart: (minutes: number) => void;
  onStop: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
};

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function ExamModeBar({ active, endsAt, onStart, onStop, onSubmit, canSubmit }: Props) {
  const [minutes, setMinutes] = useState(15);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [active]);

  if (!active) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={1}
          max={120}
          value={minutes}
          onChange={(e) => setMinutes(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
          className="w-16"
          aria-label="Exam minutes"
        />
        <Button variant="outline" onClick={() => onStart(minutes)}>
          <Play className="mr-1 size-4" /> Exam mode
        </Button>
      </div>
    );
  }

  const remaining = endsAt ? endsAt - now : 0;
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1">
      <Timer className="size-4 text-destructive" />
      <span className="font-mono text-sm tabular-nums">{fmt(remaining)}</span>
      <Button size="sm" variant="outline" onClick={onSubmit} disabled={!canSubmit}>
        <Send className="mr-1 size-3.5" /> Submit
      </Button>
      <Button size="sm" variant="ghost" onClick={onStop}>
        <Square className="size-3.5" />
      </Button>
    </div>
  );
}