import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { electronTrpcClient as trpcClient } from "renderer/lib/trpc-client";
import type { WorkspaceSearchParams } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { NotFound } from "renderer/routes/not-found";
import { useTabsStore } from "renderer/stores/tabs/store";

export const Route = createFileRoute(
	"/_authenticated/_dashboard/workspace/$workspaceId/",
)({
	component: WorkspacePage,
	notFoundComponent: NotFound,
	validateSearch: (search: Record<string, unknown>): WorkspaceSearchParams => ({
		tabId: typeof search.tabId === "string" ? search.tabId : undefined,
		paneId: typeof search.paneId === "string" ? search.paneId : undefined,
	}),
	loader: async ({ params, context }) => {
		const queryKey = [
			["workspaces", "get"],
			{ input: { id: params.workspaceId }, type: "query" },
		];

		try {
			await context.queryClient.ensureQueryData({
				queryKey,
				queryFn: () =>
					trpcClient.workspaces.get.query({ id: params.workspaceId }),
				// Accept cached data up to 30s old — avoids blocking every warm navigation
				// with an IPC round-trip. The workspace data is kept fresh by the query
				// subscriptions already active in WorkspaceContent.
				staleTime: 30_000,
			});
		} catch (error) {
			// If workspace not found, throw notFound() to render 404 page
			if (error instanceof Error && error.message.includes("not found")) {
				throw notFound();
			}
			// Re-throw other errors
			throw error;
		}
	},
});

/**
 * Thin route shell for the workspace route.
 *
 * All workspace UI (terminals, hotkeys, dialogs) lives in WorkspaceContent,
 * which is kept alive across workspace navigation by WorkspaceKeepAlive in
 * DashboardLayout. This component's only job is to:
 *   1. Run the route loader (data availability / not-found guard)
 *   2. Activate a specific tab/pane when navigated to via search params
 *      (e.g., from a notification click that includes ?tabId=...)
 */
function WorkspacePage() {
	const { workspaceId } = Route.useParams();
	const routeNavigate = Route.useNavigate();
	const { tabId: searchTabId, paneId: searchPaneId } = Route.useSearch();

	// Handle search-param-driven tab/pane activation (e.g. from notification clicks)
	useEffect(() => {
		if (!searchTabId) return;

		const state = useTabsStore.getState();
		const tab = state.tabs.find(
			(t) => t.id === searchTabId && t.workspaceId === workspaceId,
		);
		if (!tab) return;

		state.setActiveTab(workspaceId, searchTabId);

		if (searchPaneId && state.panes[searchPaneId]) {
			state.setFocusedPane(searchTabId, searchPaneId);
		}

		routeNavigate({ search: {}, replace: true });
	}, [searchTabId, searchPaneId, workspaceId, routeNavigate]);

	// Actual workspace content (terminals, layout, hotkeys) is rendered by
	// WorkspaceKeepAlive in DashboardLayout — not here.
	return null;
}
