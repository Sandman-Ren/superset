console.log("[renderer] Script executing, location:", window.location.href);

import { initSentry } from "./lib/sentry";

console.log("[renderer] Calling initSentry...");
initSentry();

import { createRouter, RouterProvider } from "@tanstack/react-router";
import ReactDom from "react-dom/client";
import { BootErrorBoundary } from "./components/BootErrorBoundary";
import {
	cleanupBootErrorHandling,
	initBootErrorHandling,
	isBootErrorReported,
	markBootMounted,
	reportBootError,
} from "./lib/boot-errors";
import { persistentHistory } from "./lib/persistent-hash-history";
import { posthog } from "./lib/posthog";
import { electronQueryClient } from "./providers/ElectronTRPCProvider";
import { routeTree } from "./routeTree.gen";

import "./globals.css";

console.log("[renderer] Imports loaded successfully");
console.log("[renderer] window.ipcRenderer available:", !!window.ipcRenderer);
console.log("[renderer] document.querySelector('app'):", !!document.querySelector("app"));

const rootElement = document.querySelector("app");
initBootErrorHandling(rootElement);

console.log("[renderer] Creating router...");
const router = createRouter({
	routeTree,
	history: persistentHistory,
	defaultPreload: "intent",
	context: {
		queryClient: electronQueryClient,
	},
});
console.log("[renderer] Router created");

const unsubscribe = router.subscribe("onResolved", (event) => {
	posthog.capture("$pageview", {
		$current_url: event.toLocation.pathname,
	});
});

const handleDeepLink = (path: string) => {
	console.log("[deep-link] Navigating to:", path);
	router.navigate({ to: path });
};
const ipcRenderer = window.ipcRenderer as typeof window.ipcRenderer | undefined;
if (ipcRenderer) {
	ipcRenderer.on("deep-link-navigate", handleDeepLink);
	console.log("[renderer] IPC renderer connected");
} else {
	console.error("[renderer] window.ipcRenderer is MISSING - preload failed");
	reportBootError(
		"Renderer preload not available (window.ipcRenderer missing)",
	);
}

if (import.meta.hot) {
	import.meta.hot.dispose(() => {
		unsubscribe();
		if (ipcRenderer) {
			ipcRenderer.off("deep-link-navigate", handleDeepLink);
		}
		cleanupBootErrorHandling();
	});
}

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (!rootElement) {
	console.error("[renderer] Missing <app> root element");
	reportBootError("Missing <app> root element");
} else if (!isBootErrorReported()) {
	console.log("[renderer] Mounting React...");
	ReactDom.createRoot(rootElement).render(
		<BootErrorBoundary
			onError={(error) => reportBootError("Render failed", error)}
		>
			<RouterProvider router={router} />
		</BootErrorBoundary>,
	);
	markBootMounted();
	console.log("[renderer] React mounted successfully");
} else {
	console.error("[renderer] Boot error was reported, skipping React mount");
}
