/**
 * Rebuild native modules for Electron on Windows.
 *
 * electron-builder's npmRebuild uses @electron/rebuild which scans the
 * workspace root and fails on node-pty (winpty.gyp's GetCommitHash.bat
 * can't be found because cmd.exe no longer searches CWD by default).
 *
 * This script rebuilds only the modules that need it, directly from the
 * app's materialized node_modules (not the Bun store).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rebuild } from "@electron/rebuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const desktopDir = join(__dirname, "..");
const electronPkg = JSON.parse(
	readFileSync(
		join(desktopDir, "node_modules", "electron", "package.json"),
		"utf8",
	),
);

console.log(
	`Rebuilding native modules for Electron ${electronPkg.version} (x64)...`,
);

try {
	await rebuild({
		buildPath: desktopDir,
		electronVersion: electronPkg.version,
		arch: "x64",
		force: true,
		// Only rebuild modules that don't have the GetCommitHash.bat issue
		onlyModules: ["better-sqlite3", "@parcel/watcher"],
	});
	console.log("Native module rebuild complete.");
} catch (error) {
	console.error("Rebuild failed:", error.message);
	process.exit(1);
}
