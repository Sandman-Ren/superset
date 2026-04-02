# Issue: 2s+ Full-Window Freeze on Workspace Tab Switch

**Status:** Fixed  
**Severity:** High  
**Platform:** All  
**Component:** `apps/desktop/src/renderer/routes/_authenticated/_dashboard/`

---

## Symptom

Switching between workspace tabs in the desktop app caused the entire window to freeze for 2 seconds or more. The freeze was proportional to the number of terminal panes open in the destination workspace — more panes, longer freeze. The UI was completely unresponsive during this period.

---

## Root Cause

Every workspace navigation unmounted the current workspace's React component tree and mounted the new one. Each mounted terminal pane synchronously ran `createTerminalInstance()` during its `useEffect`, which performs several expensive operations:

```
createTerminalInstance() per pane:
  ├── new Terminal()            — XTerm.js constructor
  ├── xterm.open(container)     — initializes WebGL canvas + DOM attachment
  ├── new LigaturesAddon()      — synchronous font measurement (most expensive)
  ├── new FitAddon()
  └── fitAddon.fit()            — triggers layout reflow
```

Each call took ~200–400ms. With 2–4 panes per workspace, this added up to 400ms–1600ms+ of synchronous work on the main thread before the browser could paint a single frame — producing the visible freeze.

The attach scheduler (`attach-scheduler.ts`) staggers IPC calls to the terminal backend, but it does not stagger XTerm DOM creation. All panes in the new workspace mounted and initialized their XTerm instances in the same React commit.

A secondary contributor was the route loader: `ensureQueryData` used the default `staleTime: 0`, which fired an IPC round-trip to the main process on every workspace navigation, even when the data was fresh.

---

## Fix

### WorkspaceKeepAlive — eliminate re-initialization on every switch

Introduced `WorkspaceKeepAlive` in `DashboardLayout`. Instead of unmounting workspace content trees on navigation, it keeps up to 5 recently-visited workspaces mounted simultaneously, toggling `display:none` on inactive ones.

```
Before: navigate to workspace B
  → unmount workspace A (terminals destroyed)
  → mount workspace B (terminals re-initialized: 400ms–1600ms freeze)

After: navigate to workspace B
  → set workspace A div to display:none  (instant)
  → set workspace B div to display:flex  (instant — already mounted)
```

The first visit to each workspace still pays the XTerm initialization cost, but all subsequent switches are instant. An LRU eviction policy (max 5) ensures memory use stays bounded — when the 6th workspace is visited, the least-recently-used workspace is unmounted and its terminals are disposed.

```tsx
// layout.tsx
const MAX_ALIVE_WORKSPACES = 5;

function WorkspaceKeepAlive({ currentWorkspaceId }) {
    const [aliveIds, setAliveIds] = useState(() =>
        currentWorkspaceId ? [currentWorkspaceId] : []
    );
    useEffect(() => {
        if (!currentWorkspaceId) return;
        setAliveIds(prev => {
            const without = prev.filter(id => id !== currentWorkspaceId);
            return [currentWorkspaceId, ...without].slice(0, MAX_ALIVE_WORKSPACES);
        });
    }, [currentWorkspaceId]);

    return aliveIds.map(wsId => (
        <div key={wsId} style={{ display: wsId === currentWorkspaceId ? "flex" : "none" }}>
            <WorkspaceContent workspaceId={wsId} isActive={wsId === currentWorkspaceId} />
        </div>
    ));
}
```

### WorkspaceIdContext — correct workspace ID for simultaneously-mounted trees

With multiple workspace trees mounted at once, components that read `workspaceId` from the URL (`useParams({ strict: false })`) would all see the same ID — the currently-active route — regardless of which tree they belong to.

Introduced `WorkspaceIdContext` so each `WorkspaceContent` provides its own `workspaceId` to its subtree via context. A `useWorkspaceId()` hook reads from context first, falling back to URL params (for components outside the workspace tree, e.g. the sidebar).

10 files inside the workspace content tree were migrated from `useParams` to `useWorkspaceId()`.

### WorkspaceContent — extracted heavy UI from the route component

All workspace UI (terminals, hotkeys, dialogs) was moved from `page.tsx` into a new `WorkspaceContent` component that accepts `workspaceId` and `isActive` props. `WorkspaceKeepAlive` renders these directly — they are no longer tied to route lifecycle.

The `isActive` prop gates hotkeys (`{ enabled: isActive }`) so hidden workspace trees do not intercept keyboard shortcuts intended for the active workspace.

### Route loader staleTime

Added `staleTime: 30_000` to the workspace route loader's `ensureQueryData` call. Warm navigations (within 30s of the last fetch) no longer block on an IPC round-trip to the main process before the route transitions.

---

## Secondary Fix: host-service migration path in dev mode

**Symptom:** `host-service` crashed on startup with:
```
Migration failed: Error: Can't find meta/_journal.json file
SqliteError: no such table: workspaces
```

**Root cause:** `getMigrationsFolder()` in `packages/host-service/src/db/db.ts` returned the packaged production path (`process.resourcesPath + "/resources/host-migrations"`) without checking whether it existed. In dev mode, Electron sets `process.resourcesPath` to the Electron binary's own resources directory (inside `node_modules/.bun/electron@.../dist/resources/`), which never contains the project's migration files. This caused the path check to always resolve to the wrong location, skipping the dev fallbacks.

**Fix:** Added `existsSync` guard before returning the production path. If it does not exist (dev mode), the function falls through to `HOST_MIGRATIONS_PATH` env var or the `import.meta.dirname`-relative source path (`packages/host-service/drizzle/`).

```ts
// Before
if (resourcesPath && !process.env.ELECTRON_RUN_AS_NODE) {
    return join(resourcesPath, "resources/host-migrations");
}

// After
if (resourcesPath && !process.env.ELECTRON_RUN_AS_NODE) {
    const productionPath = join(resourcesPath, "resources/host-migrations");
    if (existsSync(productionPath)) {
        return productionPath;
    }
}
```

---

## Files Changed

| File | Change |
|:-----|:-------|
| `apps/desktop/src/renderer/contexts/WorkspaceIdContext.tsx` | New — context + `useWorkspaceId()` hook |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/WorkspaceContent.tsx` | New — extracted heavy workspace UI |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/layout.tsx` | Added `WorkspaceKeepAlive` orchestration |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx` | Slimmed to route shell; added `staleTime: 30_000` |
| `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/$workspaceId/hooks/usePresetHotkeys.ts` | Added `options` param for `{ enabled: isActive }` support |
| 10× workspace content tree files | Migrated `useParams` → `useWorkspaceId()` |
| `packages/host-service/src/db/db.ts` | Added `existsSync` guard on production migrations path |
