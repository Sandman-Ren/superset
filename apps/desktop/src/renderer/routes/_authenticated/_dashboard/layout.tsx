import { FEATURE_FLAGS } from "@superset/shared/constants";
import {
	createFileRoute,
	Outlet,
	useMatchRoute,
	useNavigate,
} from "@tanstack/react-router";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { DashboardSidebar } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar";
import { WorkspaceContent } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/WorkspaceContent";
import { ResizablePanel } from "renderer/screens/main/components/ResizablePanel";
import { WorkspaceSidebar } from "renderer/screens/main/components/WorkspaceSidebar";
import { DeleteWorkspaceDialog } from "renderer/screens/main/components/WorkspaceSidebar/WorkspaceListItem/components";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";
import {
	COLLAPSED_WORKSPACE_SIDEBAR_WIDTH,
	DEFAULT_WORKSPACE_SIDEBAR_WIDTH,
	MAX_WORKSPACE_SIDEBAR_WIDTH,
	useWorkspaceSidebarStore,
} from "renderer/stores/workspace-sidebar-state";
import { TopBar } from "./components/TopBar";

export const Route = createFileRoute("/_authenticated/_dashboard")({
	component: DashboardLayout,
});

/**
 * Maximum number of workspaces to keep mounted simultaneously.
 * When exceeded, the least-recently-visited workspace is unmounted (and its
 * terminals are disposed). A value of 5 covers most real-world usage patterns.
 */
const MAX_ALIVE_WORKSPACES = 5;

/**
 * Keeps visited workspace content trees mounted (display:none when inactive)
 * so that terminals are never destroyed and recreated on workspace switch.
 * This eliminates the 2s+ full-window freeze caused by XTerm re-initialization.
 */
function WorkspaceKeepAlive({
	currentWorkspaceId,
}: {
	currentWorkspaceId: string | null;
}) {
	// Ordered list of workspace IDs to keep alive, most-recently-used first.
	const [aliveIds, setAliveIds] = useState<string[]>(() =>
		currentWorkspaceId ? [currentWorkspaceId] : [],
	);

	useEffect(() => {
		if (!currentWorkspaceId) return;

		setAliveIds((prev) => {
			// Move to front (most-recently-used) and trim to limit
			const without = prev.filter((id) => id !== currentWorkspaceId);
			return [currentWorkspaceId, ...without].slice(0, MAX_ALIVE_WORKSPACES);
		});
	}, [currentWorkspaceId]);

	if (aliveIds.length === 0) return null;

	return (
		<>
			{aliveIds.map((wsId) => (
				<div
					key={wsId}
					className="flex-1 min-h-0 min-w-0 overflow-hidden"
					style={{ display: wsId === currentWorkspaceId ? "flex" : "none" }}
				>
					<WorkspaceContent
						workspaceId={wsId}
						isActive={wsId === currentWorkspaceId}
					/>
				</div>
			))}
		</>
	);
}

function DashboardLayout() {
	const navigate = useNavigate();
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const isV2CloudEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.V2_CLOUD) ?? false;
	// Get current workspace from route to pre-select project in new workspace modal
	const matchRoute = useMatchRoute();
	const currentWorkspaceMatch = matchRoute({
		to: "/workspace/$workspaceId",
		fuzzy: true,
	});
	const currentWorkspaceId =
		currentWorkspaceMatch !== false ? currentWorkspaceMatch.workspaceId : null;

	const { data: currentWorkspace } = electronTrpc.workspaces.get.useQuery(
		{ id: currentWorkspaceId ?? "" },
		{ enabled: !!currentWorkspaceId },
	);

	const {
		isOpen: isWorkspaceSidebarOpen,
		toggleCollapsed: toggleWorkspaceSidebarCollapsed,
		setOpen: setWorkspaceSidebarOpen,
		width: workspaceSidebarWidth,
		setWidth: setWorkspaceSidebarWidth,
		isResizing: isWorkspaceSidebarResizing,
		setIsResizing: setWorkspaceSidebarIsResizing,
		isCollapsed: isWorkspaceSidebarCollapsed,
	} = useWorkspaceSidebarStore();

	// Global hotkeys for dashboard
	useAppHotkey(
		"OPEN_SETTINGS",
		() => navigate({ to: "/settings/account" }),
		undefined,
		[navigate],
	);

	useAppHotkey(
		"SHOW_HOTKEYS",
		() => navigate({ to: "/settings/keyboard" }),
		undefined,
		[navigate],
	);

	useAppHotkey(
		"TOGGLE_WORKSPACE_SIDEBAR",
		() => {
			if (!isWorkspaceSidebarOpen) {
				setWorkspaceSidebarOpen(true);
			} else {
				toggleWorkspaceSidebarCollapsed();
			}
		},
		undefined,
		[
			isWorkspaceSidebarOpen,
			setWorkspaceSidebarOpen,
			toggleWorkspaceSidebarCollapsed,
		],
	);

	useAppHotkey(
		"NEW_WORKSPACE",
		() => openNewWorkspaceModal(currentWorkspace?.projectId),
		undefined,
		[openNewWorkspaceModal, currentWorkspace?.projectId],
	);

	const [deleteTarget, setDeleteTarget] = useState<{
		workspaceId: string;
		workspaceName: string;
		workspaceType: "worktree" | "branch";
	} | null>(null);

	useAppHotkey(
		"CLOSE_WORKSPACE",
		() => {
			if (currentWorkspaceId && currentWorkspace) {
				setDeleteTarget({
					workspaceId: currentWorkspaceId,
					workspaceName: currentWorkspace.name,
					workspaceType: currentWorkspace.type,
				});
			}
		},
		{ enabled: !!currentWorkspaceId },
		[currentWorkspaceId, currentWorkspace],
	);

	return (
		<div className="flex flex-col h-full w-full">
			<TopBar />
			<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
				{isWorkspaceSidebarOpen && (
					<ResizablePanel
						width={workspaceSidebarWidth}
						onWidthChange={setWorkspaceSidebarWidth}
						isResizing={isWorkspaceSidebarResizing}
						onResizingChange={setWorkspaceSidebarIsResizing}
						minWidth={COLLAPSED_WORKSPACE_SIDEBAR_WIDTH}
						maxWidth={MAX_WORKSPACE_SIDEBAR_WIDTH}
						handleSide="right"
						clampWidth={false}
						onDoubleClickHandle={() =>
							setWorkspaceSidebarWidth(DEFAULT_WORKSPACE_SIDEBAR_WIDTH)
						}
					>
						{isV2CloudEnabled ? (
							<DashboardSidebar isCollapsed={isWorkspaceSidebarCollapsed()} />
						) : (
							<WorkspaceSidebar
								isCollapsed={isWorkspaceSidebarCollapsed()}
								activeProjectId={currentWorkspace?.projectId ?? null}
								activeProjectName={currentWorkspace?.project?.name ?? null}
							/>
						)}
					</ResizablePanel>
				)}
				{/*
				 * Main content area.
				 *
				 * WorkspaceKeepAlive renders workspace content trees for all recently
				 * visited workspaces, toggling display:none on inactive ones.
				 * This keeps terminals mounted so they never need to be recreated.
				 *
				 * The Outlet renders the thin WorkspacePage route shell (loader guard +
				 * search-param tab activation). It returns null so it contributes no
				 * layout. For non-workspace routes (settings etc.) the Outlet renders
				 * that route component normally while WorkspaceKeepAlive is hidden.
				 */}
				<div className="flex flex-1 min-h-0 min-w-0 relative">
					{/* Workspace content — absolutely fills the area, toggled by display:none */}
					{currentWorkspaceId !== null && (
						<div className="absolute inset-0 flex">
							<WorkspaceKeepAlive currentWorkspaceId={currentWorkspaceId} />
						</div>
					)}
					{/* Route outlet — workspace pages return null; non-workspace pages render normally */}
					<div
						className={`flex-1 min-h-0 min-w-0${currentWorkspaceId !== null ? " pointer-events-none" : ""}`}
					>
						<Outlet />
					</div>
				</div>
				{deleteTarget && (
					<DeleteWorkspaceDialog
						workspaceId={deleteTarget.workspaceId}
						workspaceName={deleteTarget.workspaceName}
						workspaceType={deleteTarget.workspaceType}
						open={true}
						onOpenChange={(open) => {
							if (!open) setDeleteTarget(null);
						}}
					/>
				)}
			</div>
		</div>
	);
}
