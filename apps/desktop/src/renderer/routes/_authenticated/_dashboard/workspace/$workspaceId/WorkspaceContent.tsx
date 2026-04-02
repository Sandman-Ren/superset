import type { ExternalApp } from "@superset/local-db";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { WorkspaceIdProvider } from "renderer/contexts/WorkspaceIdContext";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useFileOpenMode } from "renderer/hooks/useFileOpenMode";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getWorkspaceDisplayName } from "renderer/lib/getWorkspaceDisplayName";
import { usePresets } from "renderer/react-query/presets";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { usePresetHotkeys } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys";
import { useWorkspaceRunCommand } from "renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/useWorkspaceRunCommand";
import {
	CommandPalette,
	useCommandPalette,
} from "renderer/screens/main/components/CommandPalette";
import { UnsavedChangesDialog } from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/TabView/FileViewerPane/UnsavedChangesDialog";
import { useWorkspaceFileEventBridge } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useWorkspaceRenameReconciliation } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceRenameReconciliation";
import { WorkspaceInitializingView } from "renderer/screens/main/components/WorkspaceView/WorkspaceInitializingView";
import { WorkspaceLayout } from "renderer/screens/main/components/WorkspaceView/WorkspaceLayout";
import { useCreateOrOpenPR, usePRStatus } from "renderer/screens/main/hooks";
import {
	cancelPendingTabClose,
	discardAndClosePendingTab,
	requestPaneClose,
	requestTabClose,
	saveAndClosePendingTab,
} from "renderer/stores/editor-state/editorCoordinator";
import { useEditorSessionsStore } from "renderer/stores/editor-state/useEditorSessionsStore";
import { useAppHotkey } from "renderer/stores/hotkeys";
import { SidebarMode, useSidebarStore } from "renderer/stores/sidebar-state";
import { getPaneDimensions } from "renderer/stores/tabs/pane-refs";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Tab } from "renderer/stores/tabs/types";
import { useTabsWithPresets } from "renderer/stores/tabs/useTabsWithPresets";
import {
	findPanePath,
	getFirstPaneId,
	getNextPaneId,
	getPreviousPaneId,
	resolveActiveTabIdForWorkspace,
} from "renderer/stores/tabs/utils";
import {
	useHasWorkspaceFailed,
	useIsWorkspaceInitializing,
} from "renderer/stores/workspace-init";

const EMPTY_HISTORY_STACK: string[] = [];

interface WorkspaceContentProps {
	workspaceId: string;
	/**
	 * When false (workspace is hidden by KeepAlive), hotkeys and interactive
	 * elements are disabled so they don't interfere with the active workspace.
	 */
	isActive: boolean;
}

/**
 * The heavy workspace content: terminals, hotkeys, dialogs, and WorkspaceLayout.
 * Rendered by the KeepAlive layer so it stays mounted (display:none) when the
 * user navigates away, eliminating the 2s+ freeze caused by terminal re-creation.
 *
 * Accepts workspaceId as a prop (not from route params) so it works outside the
 * route context when kept alive.
 */
export function WorkspaceContent({
	workspaceId,
	isActive,
}: WorkspaceContentProps) {
	const { data: workspace } = electronTrpc.workspaces.get.useQuery({
		id: workspaceId,
	});
	useWorkspaceFileEventBridge(
		workspaceId,
		workspace?.worktreePath,
		Boolean(workspace?.worktreePath),
	);
	useWorkspaceRenameReconciliation({
		workspaceId,
		worktreePath: workspace?.worktreePath,
		enabled: Boolean(workspace?.worktreePath),
	});
	const navigate = useNavigate();

	// Keep the file open mode cache warm for addFileViewerPane
	useFileOpenMode();

	// Check if workspace is initializing or failed
	const isInitializing = useIsWorkspaceInitializing(workspaceId);
	const hasFailed = useHasWorkspaceFailed(workspaceId);

	// Check for incomplete init after app restart
	const gitStatus = workspace?.worktree?.gitStatus;
	const hasIncompleteInit =
		workspace?.type === "worktree" &&
		(gitStatus === null || gitStatus === undefined);

	const showInitView = isInitializing || hasFailed || hasIncompleteInit;

	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIdForWorkspace = useTabsStore(
		(s) => s.activeTabIds[workspaceId] ?? null,
	);
	const tabHistoryStack = useTabsStore(
		(s) => s.tabHistoryStacks[workspaceId] ?? EMPTY_HISTORY_STACK,
	);
	const {
		addTab,
		splitPaneAuto,
		splitPaneVertical,
		splitPaneHorizontal,
		openPreset,
	} = useTabsWithPresets(workspace?.projectId);
	const addChatTab = useTabsStore((s) => s.addChatTab);
	const reopenClosedTab = useTabsStore((s) => s.reopenClosedTab);
	const addBrowserTab = useTabsStore((s) => s.addBrowserTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);
	const toggleSidebar = useSidebarStore((s) => s.toggleSidebar);
	const isSidebarOpen = useSidebarStore((s) => s.isSidebarOpen);
	const setSidebarOpen = useSidebarStore((s) => s.setSidebarOpen);
	const currentSidebarMode = useSidebarStore((s) => s.currentMode);
	const setSidebarMode = useSidebarStore((s) => s.setMode);

	const tabs = useMemo(
		() => allTabs.filter((tab) => tab.workspaceId === workspaceId),
		[workspaceId, allTabs],
	);

	const activeTabId = useMemo(() => {
		return resolveActiveTabIdForWorkspace({
			workspaceId,
			tabs,
			activeTabIds: { [workspaceId]: activeTabIdForWorkspace },
			tabHistoryStacks: { [workspaceId]: tabHistoryStack },
		});
	}, [workspaceId, tabs, activeTabIdForWorkspace, tabHistoryStack]);

	const activeTab = useMemo(
		() => (activeTabId ? tabs.find((t) => t.id === activeTabId) : null),
		[activeTabId, tabs],
	);

	const focusedPaneId = useTabsStore((s) =>
		activeTabId ? (s.focusedPaneIds[activeTabId] ?? null) : null,
	);
	const pendingTabClose = useEditorSessionsStore((s) =>
		s.pendingTabClose?.workspaceId === workspaceId ? s.pendingTabClose : null,
	);

	const { toggleWorkspaceRun } = useWorkspaceRunCommand({
		workspaceId,
		worktreePath: workspace?.worktreePath,
	});

	const { matchedPresets: presets } = usePresets(workspace?.projectId);

	const openTabWithPreset = useCallback(
		(presetIndex: number) => {
			const preset = presets[presetIndex];
			if (preset) {
				openPreset(workspaceId, preset, { target: "active-tab" });
			} else {
				addTab(workspaceId);
			}
		},
		[presets, workspaceId, addTab, openPreset],
	);

	// All hotkeys guarded by isActive so hidden workspaces don't interfere
	const hotkeyOptions = { enabled: isActive };

	useAppHotkey("NEW_GROUP", () => addTab(workspaceId), hotkeyOptions, [
		workspaceId,
		addTab,
	]);
	useAppHotkey("NEW_CHAT", () => addChatTab(workspaceId), hotkeyOptions, [
		workspaceId,
		addChatTab,
	]);
	useAppHotkey(
		"REOPEN_TAB",
		() => {
			if (!reopenClosedTab(workspaceId)) {
				addChatTab(workspaceId);
			}
		},
		hotkeyOptions,
		[workspaceId, reopenClosedTab, addChatTab],
	);
	useAppHotkey("NEW_BROWSER", () => addBrowserTab(workspaceId), hotkeyOptions, [
		workspaceId,
		addBrowserTab,
	]);
	usePresetHotkeys(openTabWithPreset, hotkeyOptions);

	useAppHotkey(
		"RUN_WORKSPACE_COMMAND",
		() => toggleWorkspaceRun(),
		hotkeyOptions,
		[toggleWorkspaceRun],
	);

	useAppHotkey(
		"CLOSE_TERMINAL",
		() => {
			if (focusedPaneId) {
				requestPaneClose(focusedPaneId);
			}
		},
		hotkeyOptions,
		[focusedPaneId],
	);
	useAppHotkey(
		"CLOSE_TAB",
		() => {
			if (activeTabId) {
				requestTabClose(activeTabId);
			}
		},
		hotkeyOptions,
		[activeTabId],
	);

	useAppHotkey(
		"PREV_TAB",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const prevIndex = index <= 0 ? tabs.length - 1 : index - 1;
			setActiveTab(workspaceId, tabs[prevIndex].id);
		},
		hotkeyOptions,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"NEXT_TAB",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const nextIndex =
				index >= tabs.length - 1 || index === -1 ? 0 : index + 1;
			setActiveTab(workspaceId, tabs[nextIndex].id);
		},
		hotkeyOptions,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"PREV_TAB_ALT",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const prevIndex = index <= 0 ? tabs.length - 1 : index - 1;
			setActiveTab(workspaceId, tabs[prevIndex].id);
		},
		hotkeyOptions,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	useAppHotkey(
		"NEXT_TAB_ALT",
		() => {
			if (!activeTabId || tabs.length === 0) return;
			const index = tabs.findIndex((t) => t.id === activeTabId);
			const nextIndex =
				index >= tabs.length - 1 || index === -1 ? 0 : index + 1;
			setActiveTab(workspaceId, tabs[nextIndex].id);
		},
		hotkeyOptions,
		[workspaceId, activeTabId, tabs, setActiveTab],
	);

	const switchToTab = useCallback(
		(index: number) => {
			const tab = tabs[index];
			if (tab) {
				setActiveTab(workspaceId, tab.id);
			}
		},
		[tabs, workspaceId, setActiveTab],
	);

	useAppHotkey("JUMP_TO_TAB_1", () => switchToTab(0), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_2", () => switchToTab(1), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_3", () => switchToTab(2), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_4", () => switchToTab(3), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_5", () => switchToTab(4), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_6", () => switchToTab(5), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_7", () => switchToTab(6), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_8", () => switchToTab(7), hotkeyOptions, [
		switchToTab,
	]);
	useAppHotkey("JUMP_TO_TAB_9", () => switchToTab(8), hotkeyOptions, [
		switchToTab,
	]);

	useAppHotkey(
		"PREV_PANE",
		() => {
			if (!activeTabId || !activeTab?.layout || !focusedPaneId) return;
			const prevPaneId = getPreviousPaneId(activeTab.layout, focusedPaneId);
			if (prevPaneId) {
				setFocusedPane(activeTabId, prevPaneId);
			}
		},
		hotkeyOptions,
		[activeTabId, activeTab?.layout, focusedPaneId, setFocusedPane],
	);

	useAppHotkey(
		"NEXT_PANE",
		() => {
			if (!activeTabId || !activeTab?.layout || !focusedPaneId) return;
			const nextPaneId = getNextPaneId(activeTab.layout, focusedPaneId);
			if (nextPaneId) {
				setFocusedPane(activeTabId, nextPaneId);
			}
		},
		hotkeyOptions,
		[activeTabId, activeTab?.layout, focusedPaneId, setFocusedPane],
	);

	// Open in last used app shortcut
	const projectId = workspace?.projectId;
	const { data: defaultApp } = electronTrpc.projects.getDefaultApp.useQuery(
		{ projectId: projectId as string },
		{ enabled: !!projectId },
	);
	const resolvedDefaultApp: ExternalApp = defaultApp ?? "cursor";
	const utils = electronTrpc.useUtils();
	const { mutate: mutateOpenInApp } =
		electronTrpc.external.openInApp.useMutation({
			onSuccess: () => {
				if (projectId) {
					utils.projects.getDefaultApp.invalidate({ projectId });
				}
			},
		});
	const handleOpenInApp = useCallback(() => {
		if (workspace?.worktreePath) {
			mutateOpenInApp({
				path: workspace.worktreePath,
				app: resolvedDefaultApp,
				projectId,
			});
		}
	}, [workspace?.worktreePath, resolvedDefaultApp, mutateOpenInApp, projectId]);
	useAppHotkey("OPEN_IN_APP", handleOpenInApp, hotkeyOptions, [
		handleOpenInApp,
	]);

	// Copy path shortcut
	const { copyToClipboard } = useCopyToClipboard();
	useAppHotkey(
		"COPY_PATH",
		() => {
			if (workspace?.worktreePath) {
				copyToClipboard(workspace.worktreePath);
			}
		},
		hotkeyOptions,
		[workspace?.worktreePath],
	);

	// Open PR shortcut (⌘⇧P)
	const { pr } = usePRStatus({ workspaceId, surface: "workspace-page" });
	const { createOrOpenPR } = useCreateOrOpenPR({
		worktreePath: workspace?.worktreePath,
	});
	useAppHotkey(
		"OPEN_PR",
		() => {
			if (pr?.url) {
				window.open(pr.url, "_blank");
			} else {
				createOrOpenPR();
			}
		},
		hotkeyOptions,
		[pr?.url, createOrOpenPR],
	);

	const commandPalette = useCommandPalette({
		workspaceId,
		navigate,
	});
	const handleQuickOpen = useCallback(() => {
		commandPalette.toggle();
	}, [commandPalette.toggle]);
	useAppHotkey("QUICK_OPEN", handleQuickOpen, hotkeyOptions, [handleQuickOpen]);

	// Toggle changes sidebar (⌘L)
	useAppHotkey("TOGGLE_SIDEBAR", () => toggleSidebar(), hotkeyOptions, [
		toggleSidebar,
	]);

	// Toggle expand/collapse sidebar (⌘⇧L)
	useAppHotkey(
		"TOGGLE_EXPAND_SIDEBAR",
		() => {
			if (!isSidebarOpen) {
				setSidebarOpen(true);
				setSidebarMode(SidebarMode.Changes);
			} else {
				const isExpanded = currentSidebarMode === SidebarMode.Changes;
				setSidebarMode(isExpanded ? SidebarMode.Tabs : SidebarMode.Changes);
			}
		},
		hotkeyOptions,
		[isSidebarOpen, setSidebarOpen, setSidebarMode, currentSidebarMode],
	);

	// Pane splitting helper - resolves target pane for split operations
	const resolveSplitTarget = useCallback(
		(paneId: string, tabId: string, targetTab: Tab) => {
			const path = findPanePath(targetTab.layout, paneId);
			if (path !== null) return { path, paneId };

			const firstPaneId = getFirstPaneId(targetTab.layout);
			const firstPanePath = findPanePath(targetTab.layout, firstPaneId);
			setFocusedPane(tabId, firstPaneId);
			return { path: firstPanePath ?? [], paneId: firstPaneId };
		},
		[setFocusedPane],
	);

	// Pane splitting shortcuts
	useAppHotkey(
		"SPLIT_AUTO",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				const dimensions = getPaneDimensions(target.paneId);
				if (dimensions) {
					splitPaneAuto(activeTabId, target.paneId, dimensions, target.path);
				}
			}
		},
		hotkeyOptions,
		[activeTabId, focusedPaneId, activeTab, splitPaneAuto, resolveSplitTarget],
	);

	useAppHotkey(
		"SPLIT_RIGHT",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				splitPaneVertical(activeTabId, target.paneId, target.path);
			}
		},
		hotkeyOptions,
		[
			activeTabId,
			focusedPaneId,
			activeTab,
			splitPaneVertical,
			resolveSplitTarget,
		],
	);

	useAppHotkey(
		"SPLIT_DOWN",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				splitPaneHorizontal(activeTabId, target.paneId, target.path);
			}
		},
		hotkeyOptions,
		[
			activeTabId,
			focusedPaneId,
			activeTab,
			splitPaneHorizontal,
			resolveSplitTarget,
		],
	);

	useAppHotkey(
		"SPLIT_WITH_CHAT",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				splitPaneVertical(activeTabId, target.paneId, target.path, {
					paneType: "chat",
				});
			}
		},
		hotkeyOptions,
		[
			activeTabId,
			focusedPaneId,
			activeTab,
			splitPaneVertical,
			resolveSplitTarget,
		],
	);

	useAppHotkey(
		"SPLIT_WITH_BROWSER",
		() => {
			if (activeTabId && focusedPaneId && activeTab) {
				const target = resolveSplitTarget(
					focusedPaneId,
					activeTabId,
					activeTab,
				);
				if (!target) return;
				splitPaneVertical(activeTabId, target.paneId, target.path, {
					paneType: "webview",
				});
			}
		},
		hotkeyOptions,
		[
			activeTabId,
			focusedPaneId,
			activeTab,
			splitPaneVertical,
			resolveSplitTarget,
		],
	);

	const equalizePaneSplits = useTabsStore((s) => s.equalizePaneSplits);
	useAppHotkey(
		"EQUALIZE_PANE_SPLITS",
		() => {
			if (activeTabId) {
				equalizePaneSplits(activeTabId);
			}
		},
		hotkeyOptions,
		[activeTabId, equalizePaneSplits],
	);

	// Navigate to previous workspace (⌘↑)
	const getPreviousWorkspace =
		electronTrpc.workspaces.getPreviousWorkspace.useQuery(
			{ id: workspaceId },
			{ enabled: !!workspaceId },
		);
	useAppHotkey(
		"PREV_WORKSPACE",
		() => {
			const prevWorkspaceId = getPreviousWorkspace.data;
			if (prevWorkspaceId) {
				navigateToWorkspace(prevWorkspaceId, navigate);
			}
		},
		hotkeyOptions,
		[getPreviousWorkspace.data, navigate],
	);

	// Navigate to next workspace (⌘↓)
	const getNextWorkspace = electronTrpc.workspaces.getNextWorkspace.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	useAppHotkey(
		"NEXT_WORKSPACE",
		() => {
			const nextWorkspaceId = getNextWorkspace.data;
			if (nextWorkspaceId) {
				navigateToWorkspace(nextWorkspaceId, navigate);
			}
		},
		hotkeyOptions,
		[getNextWorkspace.data, navigate],
	);

	return (
		<WorkspaceIdProvider workspaceId={workspaceId}>
			<div className="flex-1 h-full flex flex-col overflow-hidden">
				<div className="flex-1 min-h-0 flex overflow-hidden">
					{showInitView ? (
						<WorkspaceInitializingView
							workspaceId={workspaceId}
							workspaceName={workspace?.name ?? "Workspace"}
							isInterrupted={hasIncompleteInit && !isInitializing}
						/>
					) : (
						<WorkspaceLayout
							defaultExternalApp={resolvedDefaultApp}
							onOpenInApp={handleOpenInApp}
							onOpenQuickOpen={handleQuickOpen}
						/>
					)}
				</div>
				{isActive && (
					<>
						<CommandPalette
							open={commandPalette.open}
							onOpenChange={commandPalette.handleOpenChange}
							query={commandPalette.query}
							onQueryChange={commandPalette.setQuery}
							filtersOpen={commandPalette.filtersOpen}
							onFiltersOpenChange={commandPalette.setFiltersOpen}
							includePattern={commandPalette.includePattern}
							onIncludePatternChange={commandPalette.setIncludePattern}
							excludePattern={commandPalette.excludePattern}
							onExcludePatternChange={commandPalette.setExcludePattern}
							isLoading={commandPalette.isFetching}
							searchResults={commandPalette.searchResults}
							onSelectFile={commandPalette.selectFile}
							scope={commandPalette.scope}
							onScopeChange={commandPalette.setScope}
							workspaceName={
								workspace
									? getWorkspaceDisplayName(
											workspace.name,
											workspace.type,
											workspace.project?.name,
										)
									: undefined
							}
						/>
						<UnsavedChangesDialog
							open={pendingTabClose !== null}
							onOpenChange={(open) => {
								if (!open) {
									cancelPendingTabClose(workspaceId);
								}
							}}
							onSave={() => {
								void saveAndClosePendingTab(workspaceId).catch((error) => {
									console.error(
										"[WorkspaceContent] Failed to save dirty files before closing tab",
										{
											workspaceId,
											error,
										},
									);
								});
							}}
							onDiscard={() => discardAndClosePendingTab(workspaceId)}
							isSaving={pendingTabClose?.isSaving ?? false}
							description={
								pendingTabClose
									? pendingTabClose.documentKeys.length === 1
										? "This tab has unsaved changes in 1 file. What would you like to do before closing it?"
										: `This tab has unsaved changes in ${pendingTabClose.documentKeys.length} files. What would you like to do before closing it?`
									: undefined
							}
							discardLabel="Discard & Close Tab"
							saveLabel="Save & Close Tab"
						/>
					</>
				)}
			</div>
		</WorkspaceIdProvider>
	);
}
