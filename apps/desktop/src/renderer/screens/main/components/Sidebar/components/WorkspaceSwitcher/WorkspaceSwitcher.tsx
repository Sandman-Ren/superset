import { Plus } from "lucide-react";
import type { Workspace } from "shared/types";
import { Button } from "@superset/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { ScrollArea, ScrollBar } from "@superset/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@superset/ui/tooltip";
import { getWorkspaceIcon } from "../../utils";

interface WorkspaceSwitcherProps {
  workspaces: Workspace[];
  currentWorkspaceId: string | null;
  onWorkspaceSelect: (workspaceId: string) => void;
  onAddWorkspace: () => void;
  onRemoveWorkspace: (workspaceId: string, workspaceName: string) => void;
}

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
  onWorkspaceSelect,
  onAddWorkspace,
  onRemoveWorkspace,
}: WorkspaceSwitcherProps) {
  return (
    <div className="flex border-t border-neutral-800 w-full">
      <ScrollArea className="flex-1 min-w-0" orientation="horizontal">
        <div className="flex items-center gap-2 px-2 py-2 w-max">
          {workspaces.map((ws) => {
            const Icon = getWorkspaceIcon(ws.id);
            return (
              <ContextMenu key={ws.id}>
                <Tooltip>
                  <ContextMenuTrigger asChild>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onWorkspaceSelect(ws.id)}
                        className={
                          currentWorkspaceId === ws.id ? "bg-neutral-800" : ""
                        }
                      >
                        <Icon size={18} />
                      </Button>
                    </TooltipTrigger>
                  </ContextMenuTrigger>
                  <TooltipContent side="top">
                    <p>{ws.name}</p>
                  </TooltipContent>
                  <ContextMenuContent side="top">
                    <ContextMenuItem
                      className="text-red-400 focus:text-red-400"
                      onClick={() => onRemoveWorkspace(ws.id, ws.name)}
                    >
                      Remove Workspace
                    </ContextMenuItem>
                  </ContextMenuContent>
                </Tooltip>
              </ContextMenu>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>
      <div className="flex-shrink-0 px-2 py-2 border-l border-neutral-800">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon-sm" onClick={onAddWorkspace}>
              <Plus size={18} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p>Add workspace</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
