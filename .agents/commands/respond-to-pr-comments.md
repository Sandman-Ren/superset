---
description: Address all PR review comments (including Copilot) and iterate on CI failures until all checks pass
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

Fully close out a PR: respond to all review comments, then monitor CI and fix failures until every check passes (or you determine the failure cannot or should not be fixed automatically).

$ARGUMENTS

---

## Phase 1: Fetch PR Context

```bash
gh pr view --json number,headRefName,url,state,baseRefName
```

Stop immediately if the PR is closed or merged and there are no pending CI runs to check.

Identify the repo: `gh repo view --json nameWithOwner --jq .nameWithOwner`

---

## Phase 2: Address Review Comments

### 2a. Fetch comments

```bash
# Human review comments
gh pr view <number> --json reviews,comments

# Inline code comments (including Copilot)
gh api repos/{owner}/{repo}/pulls/{number}/comments
```

### 2b. Identify commenter type

For each comment, note whether the author is:
- A **human reviewer** — treat as normal review feedback
- **`copilot[bot]`** or **`github-copilot[bot]`** — treat as automated AI review; apply the same categorization but be aware suggestions may miss context

### 2c. Categorize each comment

- **BLOCKER** — required change, bug, security issue, or correctness problem
- **QUESTION** — needs a reply
- **SUGGESTION** — optional improvement; adopt if it clearly improves the code, skip otherwise
- **NITPICK** — minor style; fix quickly or skip

For Copilot suggestions: apply if the fix is clearly better and safe. Skip if it conflicts with project conventions (check `AGENTS.md`) or if you'd need the human's judgment. When skipping a Copilot suggestion, note why.

### 2d. Address in priority order: BLOCKERs → QUESTIONs → SUGGESTIONS → NITPICKS

For each:
1. Read the relevant code for context
2. Make the fix, or draft a reply (for questions/disagreements)
3. For BLOCKERs: describe what you plan to change before editing

After all changes:
- Stage only the modified files (never `git add .`)
- Commit with a descriptive message
- Push: `git push origin <branch>`

---

## Phase 3: CI Monitor & Fix Loop

After pushing (or if no comments to address), enter the CI loop.

### 3a. Wait for checks to register

Wait ~90 seconds after a push before polling, so GitHub has time to queue new runs.

### 3b. Poll CI status

```bash
gh pr checks <number> --repo <owner>/<repo>
```

Interpret results:
- All **pass** → done, report success
- Any **pending/in_progress** → wait another 60-120s and re-poll
- Any **fail** → proceed to diagnose (step 3c)

**Expected timing:** Lint/Test/Typecheck/Sherif finish in 1-3 min. Ubuntu build ~6 min. macOS build ~12-16 min. Windows build ~17-20 min. Don't diagnose a build as hung until it exceeds 25 min.

### 3c. Diagnose failures

For each failing check, get the job ID from the `gh pr checks` URL (last path segment), then fetch logs:

```bash
gh api repos/{owner}/{repo}/actions/jobs/{job-id}/logs
```

**Lint failures:**

Extract failing file paths:
```bash
gh api repos/{owner}/{repo}/actions/jobs/{job-id}/logs \
  | grep -E "Z (apps|scripts|packages)/.*\.(ts|tsx|mjs) (format|lint)"
```

Get total error count:
```bash
gh api ... | grep -E "Found [0-9]+ (error|warning)"
```

Determine which are pre-existing (existed on `main` before this branch) vs introduced by this branch:
```bash
git log --oneline main..HEAD  # commits on this branch
git diff main --name-only      # files changed vs main
```

Fix only the files the CI is flagging — never run Biome globally:

```bash
# Step 1: format
./node_modules/.bin/biome format --write <file1> <file2> ...

# Step 2: fix import ordering and other unsafe fixes
./node_modules/.bin/biome check --write --unsafe <file1> <file2> ...

# Step 3: verify clean
./node_modules/.bin/biome check <file1> <file2> ...
# Expect: "No fixes applied"
```

**Common lint patterns and fixes:**

| Error | Fix |
|-------|-----|
| `format` (trailing spaces, quotes, line length) | `biome format --write <file>` |
| `assist/source/organizeImports` | `biome check --write --unsafe <file>` |
| `lint/correctness/useHookAtTopLevel` | Move all hook calls above any early `return` statements in the function |
| `lint/correctness/noUnusedVariables` | Prefix with `_`, or remove if truly unused |
| `lint/correctness/noUnusedImports` | Remove the import |
| `lint/style/noNonNullAssertion` | Replace `x!` with a proper null check |
| `lint/style/useTemplate` | Replace string concatenation with template literals |

**Test failures:**

Read the full test output. Common issues:
- EOL mismatch (`\n` vs `\r`): terminal commands use `\r` for ConPTY; update test expectations to match
- Wrong mock setup: check the test carefully before changing source

**Build failures:**

Read the error message. TypeScript errors are usually straightforward. Build failures on one platform only (e.g., Windows) may relate to path separators or native module availability.

### 3d. Apply fixes, commit, push, re-enter loop

After each round of fixes:
```bash
git add <specific-files>
git commit -m "fix(lint): ..."
git push origin <branch>
```

Then wait ~90s and return to step 3b.

### 3e. Know when to stop

Stop iterating and report to the user when:

1. **All checks pass** — success
2. **Failures are pre-existing** and not introduced by this branch — report the files and error counts; they need a separate housekeeping fix
3. **A failure requires human judgment** — e.g., a test is genuinely broken by logic changes, a build fails due to a missing secret or runner issue, or a lint rule conflicts with intentional project code style
4. **You've made 3+ rounds of fixes** on the same file without progress — something structural is wrong; report findings

---

## Phase 4: Final Report

Output a summary table:

| Check | Status | Notes |
|-------|--------|-------|
| Lint | ✅ pass | |
| Test | ✅ pass | |
| Typecheck | ✅ pass | |
| Sherif | ✅ pass | |
| Build (ubuntu) | ✅ pass | |
| Build (macos) | ✅ pass | |
| Build (windows) | ✅ pass | ~18 min (normal) |

List any comments addressed, any comments skipped (with reason), and whether the PR is ready to merge.
