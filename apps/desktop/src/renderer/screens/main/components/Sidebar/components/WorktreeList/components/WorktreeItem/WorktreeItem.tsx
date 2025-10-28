import { ChevronRight, GitBranch } from "lucide-react";
import type { Worktree } from "shared/types";
import { Button } from "@superset/ui/button";
import { ScreenItem } from "./components/ScreenItem";

interface WorktreeItemProps {
  worktree: Worktree;
  isExpanded: boolean;
  onToggle: (worktreeId: string) => void;
  onScreenSelect: (worktreeId: string, screenId: string) => void;
  selectedScreenId?: string;
}

export function WorktreeItem({
  worktree,
  isExpanded,
  onToggle,
  onScreenSelect,
  selectedScreenId,
}: WorktreeItemProps) {
  return (
    <div className="space-y-1">
      {/* Worktree Header */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onToggle(worktree.id)}
        className="w-full h-8 px-3 pb-1 font-normal"
        style={{ justifyContent: "flex-start" }}
      >
        <ChevronRight
          size={12}
          className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <GitBranch size={14} className="opacity-70" />
        <span className="truncate flex-1 text-left">{worktree.branch}</span>
      </Button>

      {/* Screens List */}
      {isExpanded && (
        <div className="ml-6 space-y-1">
          {(worktree.screens || []).map((screen) => (
            <ScreenItem
              key={screen.id}
              screen={screen}
              worktreeId={worktree.id}
              selectedScreenId={selectedScreenId}
              onScreenSelect={onScreenSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
