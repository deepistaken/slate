import { Button } from "@/components/ui/button";
import { HelpCircle, MessageCircleQuestion } from "lucide-react";

const LABELS = ["Nudge me", "Give a hint", "Bigger hint", "Show one step"];

type Props = {
  rung: number; // 0..3 — the rung of the last assistant message
  onMore: (nextRung: number) => void;
  onExplain: () => void;
  showExplain: boolean;
  disabled?: boolean;
};

export function HintLadder({ rung, onMore, onExplain, showExplain, disabled }: Props) {
  const next = Math.min(rung + 1, 3);
  const atTop = rung >= 3;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {!atTop && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onMore(next)}>
          <HelpCircle className="mr-1 size-3.5" />
          {LABELS[next]}
        </Button>
      )}
      {showExplain && (
        <Button size="sm" variant="outline" disabled={disabled} onClick={onExplain}>
          <MessageCircleQuestion className="mr-1 size-3.5" />
          Explain my mistake
        </Button>
      )}
    </div>
  );
}