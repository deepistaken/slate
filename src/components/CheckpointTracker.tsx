import { Check, Circle, AlertTriangle, Dot } from "lucide-react";

export type StepStatus = "pending" | "current" | "done" | "stuck";

type Props = {
  steps: string[];
  statuses: StepStatus[];
  onSelect?: (index: number) => void;
};

export function CheckpointTracker({ steps, statuses, onSelect }: Props) {
  if (!steps.length) return null;
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((s, i) => {
        const status = statuses[i] ?? "pending";
        const styles =
          status === "done"
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : status === "current"
              ? "border-primary bg-primary/10 text-foreground"
              : status === "stuck"
                ? "border-destructive/50 bg-destructive/10 text-destructive"
                : "border-border bg-muted/40 text-muted-foreground";
        const Icon =
          status === "done" ? Check : status === "stuck" ? AlertTriangle : status === "current" ? Dot : Circle;
        return (
          <li key={i}>
            <button
              type="button"
              onClick={() => onSelect?.(i)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${styles}`}
            >
              <Icon className="size-3.5" />
              <span className="font-medium">{i + 1}.</span>
              <span className="max-w-[140px] truncate">{s}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}