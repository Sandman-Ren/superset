/**
 * Cross-platform postinstall script.
 *
 * Replaces postinstall.sh so `bun install` works natively on Windows
 * (without requiring Git Bash or WSL).
 */

import { execSync } from "node:child_process";

// Prevent infinite recursion during postinstall.
// electron-builder install-app-deps can trigger nested bun installs
// which would re-run postinstall, spawning hundreds of processes.
if (process.env.SUPERSET_POSTINSTALL_RUNNING) {
	process.exit(0);
}

process.env.SUPERSET_POSTINSTALL_RUNNING = "1";

function run(cmd: string): void {
	try {
		execSync(cmd, { stdio: "inherit" });
	} catch (_error) {
		console.error(`postinstall: "${cmd}" failed`);
		process.exit(1);
	}
}

// Run sherif for workspace validation
run("sherif");

// GitHub CI runs multiple Bun install jobs that do not need desktop native rebuilds.
// Running electron-builder here can trigger nested Bun installs while the main
// install is still materializing packages, which has been flaky with native deps.
if (process.env.CI) {
	process.exit(0);
}

// Install native dependencies for desktop app
run("bun run --filter=@superset/desktop install:deps");
