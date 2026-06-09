---
name: planasaurus-run
description: "Use when running the planasaurus autonomous pipeline on a plan file — drives task implementation, multi-agent review, and external review to completion. Requires a plan .md path."
argument-hint: "path/to/plan.md [--skip-codex] [--max-iterations=N]"
---

# Planasaurus Run — Plan Execution Dispatcher

You are a DUMB DISPATCHER. Every control-flow decision — whether to loop, which phase,
when to stop — comes from the compiled state machine, never from you. You call `next`,
do exactly what the returned action says, pipe the outcome to `record`, and repeat until
the action is `done`.

Let **BIN** = `node ${CLAUDE_PLUGIN_ROOT}/bin/planasaurus.mjs`, always run from the repo root.

## Setup / Resume

1. Check for `.planasaurus/state.json`.
   - If it exists AND its `phase` field is not `"done"`: this is a RESUME (after a crash or
     context compaction). Do NOT re-init. Announce "Resuming planasaurus run" and go to The Loop.
   - Otherwise: parse `$ARGUMENTS` and run `$BIN init $ARGUMENTS`.
     - `init` detects the base branch and writes initial state. If it exits non-zero with a
       base-branch error, report it and stop (the user must resolve the branch situation).

## The Loop

Repeat until the action is `done`. **Do not pause to check in between iterations** — run
continuously. The only reasons to stop early are an unrecoverable git error or `done`.

1. Run `$BIN next`. Parse the single-line JSON action from stdout.
2. Dispatch on `action.action` using the handlers below. Each handler produces an OUTCOME object.
3. Record the result. Write the action and outcome to a temp file and pipe it, to avoid quoting issues:
   ```bash
   printf '%s' '{"action": <the action object verbatim>, "outcome": <outcome>}' | $BIN record
   ```
4. Go to step 1.

## Action Handlers

### branch  → `{name, base}`
- Determine the current branch: `git branch --show-current`.
- If current branch == `base`: if a branch named `{name}` already exists, `git checkout {name}`;
  else `git checkout -b {name}`.
- If already on a non-base branch (e.g. resuming): leave it as-is.
- OUTCOME: `{}`

### task  → `{plan}`
- Spawn ONE foreground Agent (general-purpose). Its prompt is the contents of
  `${CLAUDE_PLUGIN_ROOT}/agents/task.md` with `{PLAN}` replaced by `action.plan`.
- The agent implements one task, writes tests, marks checkboxes `[x]`, and commits.
- Parse the last `STATUS:` line from the agent's reply. If no STATUS line is present,
  re-read the plan: if the task's boxes are now `[x]`, treat as `task_done`; else `failed`.
- OUTCOME: `{"result": "task_done"|"all_done"|"failed"}`

### review  → `{mode}`
- Determine the base branch from `.planasaurus/state.json` (`baseBranch` field).
- Select lenses:
  - `mode == "first"` → all five: quality, implementation, testing, simplification, documentation.
  - `mode == "second"` → quality, implementation only; append to each prompt:
    "Report ONLY critical and major issues; ignore minor/style."
- Spawn ALL selected lenses as foreground Agents **in a single message** (parallel). Each agent's
  prompt is the contents of `${CLAUDE_PLUGIN_ROOT}/agents/review-<lens>.md` with `{BASE}` replaced
  by the base branch. If an agent fails/times out, log it and proceed with the others.
- Collect every agent's `FINDINGS:` JSON. Merge into one list.
- VERIFY each finding yourself: read the code at file:line with ~20 lines of context. Mark
  `confirmed: true` only if it is a real problem; otherwise `confirmed: false` (false positive).
- FIX every confirmed finding. Then run the project's tests and lint. All tests must pass.
  - If tests pass and at least one fix was made: `git commit -am "fix: address review findings"`,
    mark those findings `fixed: true`.
  - If tests fail after a fix attempt, retry once; if still failing, do NOT commit — leave
    `fixed: false` for the unfixed ones.
- OUTCOME: `{"findings": [{"file","line","issue","confirmed":bool,"fixed":bool}, ...]}`
  Include ALL findings (confirmed and not) — the binary dedupes them to decide convergence.

### codex  → `{dismissalContext}`
TODO(Task 5): run external review (codex or adversarial-Claude fallback), verify, fix, record.

### commit  → `{message}`
- Run `git commit -am "{message}"`. If there is nothing to commit, that is fine — proceed.
- OUTCOME: `{}`

### finalize  → `{plan}`
- `mkdir -p docs/plans/completed`
- Move the plan: `git mv {plan} docs/plans/completed/` (fall back to `mv` + `git add` if not tracked).
- `git commit -m "chore: move completed plan to docs/plans/completed/"`
- OUTCOME: `{}`

### done  → `{summary}`
- Report the `summary` to the user as a concise completion message.
- STOP. The pipeline is complete.
