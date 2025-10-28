import { SquareTerminal } from "lucide-react";
import type { Screen } from "shared/types";
import { Button } from "@superset/ui/button";

interface ScreenItemProps {
  screen: Screen;
  worktreeId: string;
  selectedScreenId?: string;
  onScreenSelect: (worktreeId: string, screenId: string) => void;
}

export function ScreenItem({
  screen,
  worktreeId,
  selectedScreenId,
  onScreenSelect,
}: ScreenItemProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onScreenSelect(worktreeId, screen.id)}
      className={`w-full h-8 px-3 font-normal ${
        selectedScreenId === screen.id
          ? "bg-neutral-800 border border-neutral-700"
          : ""
      }`}
      style={{ justifyContent: "flex-start" }}
    >
      <SquareTerminal size={14} />
      <span className="truncate">{screen.name}</span>
    </Button>
  );
}
