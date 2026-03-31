import { spawn } from "node:child_process";
import fs from "node:fs";
import nodePath from "node:path";
import type { ExternalApp } from "@superset/local-db";

/** Map of app IDs to their macOS application names */
const MACOS_APP_NAMES: Record<ExternalApp, string | null> = {
	finder: null, // Handled specially with shell.showItemInFolder
	vscode: "Visual Studio Code",
	"vscode-insiders": "Visual Studio Code - Insiders",
	cursor: "Cursor",
	antigravity: "Antigravity",
	windsurf: "Windsurf",
	zed: "Zed",
	xcode: "Xcode",
	iterm: "iTerm",
	warp: "Warp",
	terminal: "Terminal",
	ghostty: "Ghostty",
	sublime: "Sublime Text",
	intellij: null, // Multi-edition, uses bundle IDs
	webstorm: "WebStorm",
	pycharm: null, // Multi-edition, uses bundle IDs
	phpstorm: "PhpStorm",
	rubymine: "RubyMine",
	goland: "GoLand",
	clion: "CLion",
	rider: "Rider",
	datagrip: "DataGrip",
	appcode: "AppCode",
	fleet: "Fleet",
	rustrover: "RustRover",
	"android-studio": "Android Studio",
};

/**
 * Bundle ID candidates for JetBrains IDEs with multiple editions.
 * `open -b <bundleId>` works regardless of the .app display name,
 * so "IntelliJ IDEA Ultimate.app" and "IntelliJ IDEA CE.app" both resolve correctly.
 */
const BUNDLE_ID_CANDIDATES: Partial<Record<ExternalApp, string[]>> = {
	intellij: ["com.jetbrains.intellij", "com.jetbrains.intellij.ce"],
	pycharm: ["com.jetbrains.pycharm", "com.jetbrains.pycharm.ce"],
};

/** Map of app IDs to their Linux CLI commands */
const LINUX_CLI_COMMANDS: Record<ExternalApp, string | null> = {
	finder: null, // Handled specially with shell.showItemInFolder
	vscode: "code",
	"vscode-insiders": "code-insiders",
	cursor: "cursor",
	antigravity: "antigravity",
	windsurf: "windsurf",
	zed: "zed",
	xcode: null, // macOS only
	iterm: null, // macOS only
	warp: "warp-terminal",
	terminal: null, // No universal Linux terminal command
	ghostty: "ghostty",
	sublime: "subl",
	intellij: null, // Multi-edition, uses CLI candidates
	webstorm: "webstorm",
	pycharm: null, // Multi-edition, uses CLI candidates
	phpstorm: "phpstorm",
	rubymine: "rubymine",
	goland: "goland",
	clion: "clion",
	rider: "rider",
	datagrip: "datagrip",
	appcode: null, // macOS only
	fleet: "fleet",
	rustrover: "rustrover",
	"android-studio": "studio",
};

/**
 * CLI command candidates for JetBrains IDEs with multiple editions on Linux.
 * JetBrains Toolbox typically creates `idea`/`pycharm` launchers,
 * while package managers may use edition-specific names.
 */
const LINUX_CLI_CANDIDATES: Partial<Record<ExternalApp, string[]>> = {
	intellij: ["idea", "intellij-idea-ultimate", "intellij-idea-community"],
	pycharm: ["pycharm", "pycharm-professional", "pycharm-community"],
};

// ---------------------------------------------------------------------------
// Windows app resolution
// ---------------------------------------------------------------------------

type WindowsAppConfig = {
	cli?: string;
	exeNames?: string[];
	installDir?: string;
	jetbrainsExe?: string;
	args?: (targetPath: string) => string[];
};

const WINDOWS_APP_CONFIG: Record<ExternalApp, WindowsAppConfig> = {
	finder: {},
	vscode: { cli: "code", exeNames: ["Code.exe"], installDir: "Microsoft VS Code" },
	"vscode-insiders": { cli: "code-insiders", exeNames: ["Code - Insiders.exe"], installDir: "Microsoft VS Code Insiders" },
	cursor: { cli: "cursor", exeNames: ["Cursor.exe"], installDir: "Cursor" },
	antigravity: { cli: "antigravity" },
	windsurf: { cli: "windsurf", exeNames: ["Windsurf.exe"], installDir: "Windsurf" },
	zed: { cli: "zed" },
	xcode: {},
	iterm: {},
	warp: { cli: "warp-terminal" },
	terminal: {
		cli: "wt",
		exeNames: ["wt.exe", "WindowsTerminal.exe"],
		args: (target) => ["-d", target],
	},
	ghostty: { cli: "ghostty" },
	sublime: { cli: "subl", exeNames: ["subl.exe", "sublime_text.exe"], installDir: "Sublime Text" },
	intellij: { jetbrainsExe: "idea64.exe" },
	webstorm: { cli: "webstorm", jetbrainsExe: "webstorm64.exe" },
	pycharm: { jetbrainsExe: "pycharm64.exe" },
	phpstorm: { cli: "phpstorm", jetbrainsExe: "phpstorm64.exe" },
	rubymine: { cli: "rubymine", jetbrainsExe: "rubymine64.exe" },
	goland: { cli: "goland", jetbrainsExe: "goland64.exe" },
	clion: { cli: "clion", jetbrainsExe: "clion64.exe" },
	rider: { cli: "rider", jetbrainsExe: "rider64.exe" },
	datagrip: { cli: "datagrip", jetbrainsExe: "datagrip64.exe" },
	appcode: {},
	fleet: { cli: "fleet" },
	rustrover: { cli: "rustrover", jetbrainsExe: "rustrover64.exe" },
	"android-studio": { cli: "studio", exeNames: ["studio64.exe"], installDir: "Android Studio" },
};

function getWindowsProgramRoots(): string[] {
	const roots: string[] = [];
	const pf = process.env.ProgramFiles;
	const pfx86 = process.env["ProgramFiles(x86)"];
	const localAppData = process.env.LOCALAPPDATA;
	if (pf) roots.push(pf);
	if (pfx86) roots.push(pfx86);
	if (localAppData) {
		roots.push(nodePath.join(localAppData, "Programs"));
		roots.push(localAppData);
	}
	return roots;
}

function findExistingPath(...candidates: string[]): string | null {
	for (const p of candidates) {
		if (fs.existsSync(p)) return p;
	}
	return null;
}

function findJetBrainsExe(exeName: string): string | null {
	const roots = getWindowsProgramRoots();
	// Standard install: C:\Program Files\JetBrains\<Product>\bin\<exe>
	for (const root of roots) {
		const jbDir = nodePath.join(root, "JetBrains");
		if (!fs.existsSync(jbDir)) continue;
		try {
			for (const entry of fs.readdirSync(jbDir)) {
				const candidate = nodePath.join(jbDir, entry, "bin", exeName);
				if (fs.existsSync(candidate)) return candidate;
			}
		} catch {}
	}
	// Toolbox: ~/AppData/Local/JetBrains/Toolbox/apps/<product>/ch-0/*/bin/<exe>
	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) {
		const toolboxApps = nodePath.join(localAppData, "JetBrains", "Toolbox", "apps");
		if (fs.existsSync(toolboxApps)) {
			try {
				for (const product of fs.readdirSync(toolboxApps)) {
					const chDir = nodePath.join(toolboxApps, product, "ch-0");
					if (!fs.existsSync(chDir)) continue;
					const versions = fs.readdirSync(chDir).sort().reverse();
					for (const ver of versions) {
						const candidate = nodePath.join(chDir, ver, "bin", exeName);
						if (fs.existsSync(candidate)) return candidate;
					}
				}
			} catch {}
		}
	}
	return null;
}

function getWindowsAppCommand(
	app: ExternalApp,
	targetPath: string,
): { command: string; args: string[] }[] | null {
	const config = WINDOWS_APP_CONFIG[app];
	if (!config || Object.keys(config).length === 0) return null;

	const args = config.args ? config.args(targetPath) : [targetPath];

	// Try full exe path first
	if (config.exeNames && config.installDir) {
		const roots = getWindowsProgramRoots();
		for (const root of roots) {
			for (const exe of config.exeNames) {
				const fullPath = nodePath.join(root, config.installDir, exe);
				if (fs.existsSync(fullPath)) {
					return [{ command: fullPath, args }];
				}
			}
		}
	}

	// JetBrains resolution
	if (config.jetbrainsExe) {
		const jbExe = findJetBrainsExe(config.jetbrainsExe);
		if (jbExe) {
			return [{ command: jbExe, args }];
		}
	}

	// CLI fallback (relies on PATH)
	if (config.cli) {
		return [{ command: config.cli, args }];
	}

	return null;
}

/**
 * Get candidate commands to open a path in the specified app.
 * Returns an array of commands to try in order — for multi-edition apps (IntelliJ, PyCharm),
 * multiple candidates are returned so the caller can fall back if one isn't installed.
 *
 * macOS: Uses `open -b` (bundle ID) for multi-edition apps and `open -a` (app name) for others.
 * Windows: Searches Program Files, LOCALAPPDATA, and JetBrains Toolbox for executables.
 * Linux: Uses direct CLI commands (e.g. `code`, `cursor`, `zed`).
 */
export function getAppCommand(
	app: ExternalApp,
	targetPath: string,
	platform: NodeJS.Platform = process.platform,
): { command: string; args: string[] }[] | null {
	if (platform === "win32") {
		return getWindowsAppCommand(app, targetPath);
	}

	if (platform === "darwin") {
		const bundleIds = BUNDLE_ID_CANDIDATES[app];
		if (bundleIds) {
			return bundleIds.map((id) => ({
				command: "open",
				args: ["-b", id, targetPath],
			}));
		}

		const appName = MACOS_APP_NAMES[app];
		if (!appName) return null;
		return [{ command: "open", args: ["-a", appName, targetPath] }];
	}

	// Linux (and other non-macOS platforms)
	const linuxCandidates = LINUX_CLI_CANDIDATES[app];
	if (linuxCandidates) {
		return linuxCandidates.map((cmd) => ({
			command: cmd,
			args: [targetPath],
		}));
	}

	const cliCommand = LINUX_CLI_COMMANDS[app];
	if (!cliCommand) return null;
	return [{ command: cliCommand, args: [targetPath] }];
}

/**
 * Wrapper characters that can surround paths.
 * These are pairs of [open, close] characters.
 */
const PATH_WRAPPERS: [string, string][] = [
	['"', '"'],
	["'", "'"],
	["`", "`"],
	["(", ")"],
	["[", "]"],
	["<", ">"],
];

/**
 * Trailing punctuation that can appear after paths in sentences.
 * These are stripped unless they're part of a valid suffix (extension, line:col).
 */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * Check if a string looks like a file path.
 * A path typically contains forward slashes, or starts with ., ~, or /
 */
function looksLikePath(str: string): boolean {
	return (
		str.includes("/") ||
		str.includes("\\") ||
		str.startsWith(".") ||
		str.startsWith("~") ||
		str.startsWith("/") ||
		/^[A-Za-z]:/.test(str) // Windows drive letter
	);
}

/**
 * Extract a path from within brackets/parentheses when there's adjacent text.
 * Handles patterns like:
 *   "text(src/file.ts)more" -> "src/file.ts"
 *   "see (path/to/file) here" -> "path/to/file"
 *   "in [src/file.ts:42]" -> "src/file.ts:42"
 *
 * Returns the original string if no embedded path is found.
 */
function extractEmbeddedPath(input: string): string {
	const bracketPairs: [string, string][] = [
		["(", ")"],
		["[", "]"],
		["<", ">"],
	];

	for (const [open, close] of bracketPairs) {
		const openIdx = input.indexOf(open);
		const closeIdx = input.lastIndexOf(close);

		if (openIdx !== -1 && closeIdx > openIdx) {
			const hasTextBefore = openIdx > 0;
			const hasTextAfter = closeIdx < input.length - 1;

			if (hasTextBefore || hasTextAfter) {
				const content = input.slice(openIdx + 1, closeIdx);
				if (looksLikePath(content)) {
					return content;
				}
			}
		}
	}

	return input;
}

/**
 * Strip trailing punctuation from a path, but preserve valid suffixes.
 * - Preserves file extensions like .ts, .json
 * - Preserves line:col suffixes like :42 or :42:10
 * - Strips sentence punctuation like trailing period, comma, etc.
 */
function stripTrailingPunctuation(path: string): string {
	const match = path.match(TRAILING_PUNCTUATION);
	if (!match) return path;

	const punct = match[0];
	const beforePunct = path.slice(0, -punct.length);

	// Don't strip if it looks like a file extension (e.g., "file.ts")
	if (punct === "." || punct.startsWith(".")) {
		const extMatch = beforePunct.match(/\.[a-zA-Z0-9]{1,10}$/);
		if (extMatch) {
			return beforePunct;
		}
		// e.g., path ends with ".ts." - strip just the final "."
		if (/^\.[a-zA-Z0-9]{1,10}\.$/.test(punct)) {
			return path.slice(0, -1);
		}
	}

	// Don't strip colons followed by digits (line numbers like :42)
	if (punct === ":") {
		return beforePunct;
	}
	if (punct.startsWith(":") && /^:\d/.test(punct)) {
		return path;
	}

	return beforePunct;
}

/**
 * Strip matching wrapper characters and trailing punctuation from a path.
 * Handles nested wrappers and multiple layers of wrapping.
 * Examples:
 *   "(path/to/file)" -> "path/to/file"
 *   '"path/to/file"' -> "path/to/file"
 *   "'(path/to/file)'" -> "path/to/file"
 *   "./path/file.ts." -> "./path/file.ts"
 *   '"./path/file.ts",' -> "./path/file.ts"
 *   "path/to/file" -> "path/to/file" (unchanged)
 */
export function stripPathWrappers(filePath: string): string {
	let result = filePath.trim();

	// First, try to extract embedded paths from patterns like "text(path)more"
	result = extractEmbeddedPath(result);

	let changed = true;
	while (changed && result.length > 0) {
		changed = false;

		const withoutPunct = stripTrailingPunctuation(result);
		if (withoutPunct !== result) {
			result = withoutPunct;
			changed = true;
			continue;
		}

		for (const [open, close] of PATH_WRAPPERS) {
			if (result.startsWith(open) && result.endsWith(close)) {
				result = result.slice(1, -1);
				changed = true;
				break;
			}
		}
	}

	return result;
}

/**
 * Resolve a path by expanding ~ and converting relative paths to absolute.
 * Also handles file:// URLs by converting them to regular file paths.
 * Strips wrapping characters like quotes, parentheses, brackets, etc.
 */
export function resolvePath(filePath: string, cwd?: string): string {
	let resolved = stripPathWrappers(filePath);

	if (resolved.startsWith("file://")) {
		try {
			const url = new URL(resolved);
			resolved = decodeURIComponent(url.pathname);
		} catch {
			// If URL parsing fails, try simple prefix removal
			resolved = decodeURIComponent(resolved.replace(/^file:\/\//, ""));
		}
	}

	if (resolved.startsWith("~")) {
		const home = process.env.HOME || process.env.USERPROFILE;
		if (home) {
			resolved = resolved.replace(/^~/, home);
		}
	}

	if (!nodePath.isAbsolute(resolved)) {
		resolved = cwd
			? nodePath.resolve(cwd, resolved)
			: nodePath.resolve(resolved);
	}

	return resolved;
}

/**
 * Spawns a process and waits for it to complete.
 * @throws Error if the process exits with non-zero code or fails to spawn
 */
export function spawnAsync(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "ignore", "pipe"],
			detached: false,
		});

		let stderr = "";
		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("error", (error) => {
			reject(
				new Error(
					`Failed to spawn '${command}': ${error.message}. Ensure the application is installed.`,
				),
			);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				const stderrMessage = stderr.trim();
				reject(
					new Error(stderrMessage || `'${command}' exited with code ${code}`),
				);
			}
		});
	});
}

export type { ExternalApp };
