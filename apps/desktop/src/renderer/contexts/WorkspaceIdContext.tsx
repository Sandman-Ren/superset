import { useParams } from "@tanstack/react-router";
import { createContext, useContext } from "react";

/**
 * Context that provides a workspace ID independently of the URL route params.
 * Used by the workspace KeepAlive system so that "background" (hidden but mounted)
 * workspace component trees read their own workspace ID rather than the currently
 * active route's workspace ID.
 */
const WorkspaceIdContext = createContext<string | null>(null);

export function WorkspaceIdProvider({
	workspaceId,
	children,
}: {
	workspaceId: string;
	children: React.ReactNode;
}) {
	return (
		<WorkspaceIdContext.Provider value={workspaceId}>
			{children}
		</WorkspaceIdContext.Provider>
	);
}

/**
 * Returns the workspace ID from the nearest WorkspaceIdProvider, or falls back
 * to the URL route params. The context takes precedence so that KeepAlive-mounted
 * workspace trees read the correct workspace ID even when they are hidden.
 */
export function useWorkspaceId(): string {
	const ctx = useContext(WorkspaceIdContext);
	const { workspaceId } = useParams({ strict: false }) as {
		workspaceId: string | undefined;
	};
	if (ctx !== null) return ctx;
	if (!workspaceId) {
		throw new Error(
			"useWorkspaceId called outside a workspace route or WorkspaceIdProvider",
		);
	}
	return workspaceId;
}
