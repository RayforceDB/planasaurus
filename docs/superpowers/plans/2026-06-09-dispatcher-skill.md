# Planasaurus Dispatcher Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. When authoring any `SKILL.md`, the implementer MUST use the `superpowers:writing-skills` skill.

**Goal:** Ship the Claude Code plugin layer that turns the deterministic `planasaurus` binary into a runnable autonomous pipeline — a dumb-dispatcher skill that calls the binary's `next`/`record` state machine and executes each named action (branch, task, review, codex, commit, finalize) via subagents and git, all inside one flat-billed session.

**Architecture:** A single entry-point skill `planasaurus-run` owns a prose loop with ZERO control-flow logic of its own: it runs `planasaurus next`, dispatches the returned action, pipes the outcome to `planasaurus record`, and repeats until `done`. Subagent prompts live in standalone `agents/*.md` files (read by the spawned subagents, keeping the dispatcher lean). External review uses `codex:rescue` if installed, else falls back to an adversarial Claude subagent — never zero second opinion. The binary (already built and tested in plan 1) is the brain; this layer is hands. Because all state lives in `.planasaurus/`, the loop resumes after a crash or context compaction.

**Tech Stack:** Claude Code plugin (`.claude-plugin/plugin.json`, `skills/`, prose `agents/*.md`), the existing Node binary at `bin/planasaurus.mjs`, `node:test` for the contract test, git CLI.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `.claude-plugin/plugin.json` | Plugin manifest (name, description, version) |
| `skills/planasaurus-run/SKILL.md` | The dispatcher: setup/resume + the action loop. The ONLY skill. |
| `agents/task.md` | Prompt for the task-implementer subagent (one task per iteration) |
| `agents/review-quality.md` | Review lens: bugs, security, races, resource/error handling |
| `agents/review-implementation.md` | Review lens: correctness of approach, requirement coverage, wiring |
| `agents/review-testing.md` | Review lens: coverage, fake tests, edge cases |
| `agents/review-simplification.md` | Review lens: over-engineering, YAGNI |
| `agents/review-documentation.md` | Review lens: README/CLAUDE.md/plan updates |
| `agents/external-review.md` | Codex prompt + adversarial-Claude fallback prompt |
| `test/pipeline.test.mjs` | Pure-function simulation of a FULL run (incl codex fix→commit→clean, 2 review rounds) asserting the action sequence the dispatcher follows |
| `README.md` | Install + usage |

The binary already exists at `bin/planasaurus.mjs`; the dispatcher invokes it as `node ${CLAUDE_PLUGIN_ROOT}/bin/planasaurus.mjs`.

### The action contract (recap from plan 1, what the dispatcher must handle)

```jsonc
{"action":"branch",   "name":"fix-issues", "base":"main"}
{"action":"task",     "plan":"docs/plans/x.md"}
{"action":"review",   "mode":"first"|"second"}
{"action":"codex",    "dismissalContext":"..."}
{"action":"commit",   "message":"fix: address codex review findings"}
{"action":"finalize", "plan":"docs/plans/x.md"}
{"action":"done",     "summary":{...}}
```

`record` receives `{"action": <the action object verbatim>, "outcome": <result>}` on stdin.

---

## Task 1: Plugin manifest

**Files:**
- Create: `.claude-plugin/plugin.json`

- [ ] **Step 1: Write the manifest**

`.claude-plugin/plugin.json`:
```json
{
  "name": "planasaurus",
  "description": "Autonomous plan-execution pipeline (task loop, multi-agent review, external review) driven by a deterministic state-machine binary.",
  "version": "0.1.0",
  "author": { "name": "Rayforce" }
}
```

- [ ] **Step 2: Validate**

Run: `cd /Users/antonkundenko/data/work/planasaurus && claude plugin validate .`
Expected: validation passes (manifest is well-formed). If `claude` CLI is unavailable in the environment, instead confirm the JSON parses: `node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json','utf8')); console.log('ok')"` → prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git commit -m "feat: add plugin manifest"
```

---

## Task 2: Dispatcher skill — setup/resume + loop frame + deterministic actions

**Files:**
- Create: `skills/planasaurus-run/SKILL.md`

This task writes the dispatcher with the loop frame and the three deterministic git/binary action handlers (branch, commit, finalize) plus done. The token-spending handlers (task, review, codex) are stubbed with a clear `TODO(Task N)` marker filled in by later tasks. **Use the `superpowers:writing-skills` skill while authoring this file.**

- [ ] **Step 1: Write the skill**

`skills/planasaurus-run/SKILL.md`:
````markdown
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
TODO(Task 3): spawn the task implementer subagent and record its STATUS.

### review  → `{mode}`
TODO(Task 4): spawn the review fan-out, verify findings, fix, record.

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
````

- [ ] **Step 2: Validate**

Run: `cd /Users/antonkundenko/data/work/planasaurus && claude plugin validate .` (or, if `claude` is unavailable, confirm the file has valid YAML frontmatter: `node -e "const f=require('fs').readFileSync('skills/planasaurus-run/SKILL.md','utf8'); if(!f.startsWith('---')) throw new Error('no frontmatter'); console.log('ok')"`).
Expected: passes / prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add skills/planasaurus-run/SKILL.md
git commit -m "feat: add dispatcher skill with loop frame and deterministic actions"
```

---

## Task 3: Task implementer agent + wire the `task` handler

**Files:**
- Create: `agents/task.md`
- Modify: `skills/planasaurus-run/SKILL.md` (replace the `task` TODO)

- [ ] **Step 1: Write the task agent prompt**

`agents/task.md`:
```markdown
# Planasaurus Task Implementer

Read the plan file at: {PLAN}

Read the plan's Overview and Context sections to understand the project.

Find the FIRST `### Task N:` or `### Iteration N:` section that still has unchecked `[ ]`
checkboxes. That is your task.

CRITICAL: Complete ONE task section only. Do NOT continue to the next task.

STEP 0 — ANNOUNCE (under 150 words): task number, what it accomplishes, key files.

STEP 1 — IMPLEMENT: implement every `[ ]` item in this task section. Write tests for it.

STEP 2 — VALIDATE: run the test and lint commands the plan specifies. Fix failures, repeat
until all pass. All tests must pass before you proceed.

STEP 3 — COMPLETE:
- Edit the plan: change `[ ]` to `[x]` for each completed checkbox in this Task section.
- If Task sections are done but Success criteria / Overview / Context have `[ ]` items already
  satisfied by this implementation, mark them `[x]` too.
- Non-automatable items (manual testing, deployment): mark `[x]` with note "(skipped — not automatable)".
- Commit code + updated plan: `git commit -m "feat: <brief task description>"`.
- Re-read the plan. If no `[ ]` remain in any Task/Iteration section, use `all_done`, else `task_done`.

End your response with exactly one line:
STATUS: {"result": "task_done"|"all_done"|"failed", "message": "..."}
```

- [ ] **Step 2: Wire the handler** — in `skills/planasaurus-run/SKILL.md`, replace the `task` TODO block with:

````markdown
### task  → `{plan}`
- Spawn ONE foreground Agent (general-purpose). Its prompt is the contents of
  `${CLAUDE_PLUGIN_ROOT}/agents/task.md` with `{PLAN}` replaced by `action.plan`.
- The agent implements one task, writes tests, marks checkboxes `[x]`, and commits.
- Parse the last `STATUS:` line from the agent's reply. If no STATUS line is present,
  re-read the plan: if the task's boxes are now `[x]`, treat as `task_done`; else `failed`.
- OUTCOME: `{"result": "task_done"|"all_done"|"failed"}`
````

- [ ] **Step 3: Validate** — confirm the TODO is gone and the file still has valid frontmatter:

Run: `cd /Users/antonkundenko/data/work/planasaurus && grep -c "TODO(Task 3)" skills/planasaurus-run/SKILL.md` → Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add agents/task.md skills/planasaurus-run/SKILL.md
git commit -m "feat: add task implementer agent and wire task handler"
```

---

## Task 4: Review agents + wire the `review` handler

**Files:**
- Create: `agents/review-quality.md`, `agents/review-implementation.md`, `agents/review-testing.md`, `agents/review-simplification.md`, `agents/review-documentation.md`
- Modify: `skills/planasaurus-run/SKILL.md` (replace the `review` TODO)

All five lens files share a common shape: a focus section, an output format, and a REQUIRED machine-parseable `FINDINGS:` JSON line the dispatcher collects.

- [ ] **Step 1: Write the five lens files**

`agents/review-quality.md`:
```markdown
# Review Lens: Quality

Run `git diff {BASE}...HEAD` and `git log {BASE}..HEAD --oneline` to see the changes.

Review ONLY the changes for:
- Correctness: logic errors, off-by-one, wrong conditionals/operators, edge cases (empty/nil/boundary).
- Error handling: unchecked errors, silent failures, missing wrapping.
- Resource management: leaks, missing cleanup, incorrect release.
- Concurrency: races, deadlocks, goroutine/thread leaks.
- Security: input validation, injection (SQL/command/path), secret exposure, auth checks.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, a one-line description, severity (critical/major/minor), a fix suggestion.

End your response with exactly one line of machine-readable JSON:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"critical|major|minor"}]
(empty array if nothing found)
```

`agents/review-implementation.md`:
```markdown
# Review Lens: Implementation

Run `git diff {BASE}...HEAD` and `git log {BASE}..HEAD --oneline` to see the changes.

Review ONLY the changes for:
- Correctness of approach: does the implementation actually solve the stated task?
- Requirement coverage: anything specified but not implemented?
- Wiring: are new functions/modules actually called and connected, not dead code?
- Completeness: stubs, TODOs, half-finished paths left behind.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, description, severity (critical/major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"critical|major|minor"}]
```

`agents/review-testing.md`:
```markdown
# Review Lens: Testing

Run `git diff {BASE}...HEAD` to see the changes.

Review ONLY the changes for:
- Coverage: are new behaviors and branches tested?
- Fake tests: assertions that can't fail, tests that mock the thing under test, tautologies.
- Edge cases: are boundaries, error paths, and empty inputs tested?

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, description, severity (critical/major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"critical|major|minor"}]
```

`agents/review-simplification.md`:
```markdown
# Review Lens: Simplification

Run `git diff {BASE}...HEAD` to see the changes.

Review ONLY the changes for over-engineering:
- Unnecessary abstractions or indirection for a simple problem.
- Enterprise patterns where a direct solution works.
- Premature optimization, speculative generality, YAGNI violations.
- Scope creep beyond the stated task.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, description, severity (major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"major|minor"}]
```

`agents/review-documentation.md`:
```markdown
# Review Lens: Documentation

Run `git diff {BASE}...HEAD` to see the changes.

Review ONLY for documentation gaps introduced by these changes:
- New behavior/flags/config not reflected in README or CLAUDE.md.
- Plan file checkboxes left unchecked for work that is actually done.
- Public functions/modules lacking a short doc comment where the codebase expects one.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line (or file), description, severity (major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"major|minor"}]
```

- [ ] **Step 2: Wire the handler** — in `skills/planasaurus-run/SKILL.md`, replace the `review` TODO block with:

````markdown
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
````

- [ ] **Step 3: Validate** — `cd /Users/antonkundenko/data/work/planasaurus && grep -c "TODO(Task 4)" skills/planasaurus-run/SKILL.md` → Expected: `0`. And `ls agents/review-*.md | wc -l` → Expected: `5`.

- [ ] **Step 4: Commit**

```bash
git add agents/review-*.md skills/planasaurus-run/SKILL.md
git commit -m "feat: add five review lens agents and wire review handler"
```

---

## Task 5: External review agent + wire the `codex` handler

**Files:**
- Create: `agents/external-review.md`
- Modify: `skills/planasaurus-run/SKILL.md` (replace the `codex` TODO)

- [ ] **Step 1: Write the external-review prompt file**

`agents/external-review.md`:
```markdown
# Planasaurus External Review

Two prompts. The dispatcher picks ONE based on whether the codex:rescue plugin is available.
In both, {BASE} is the base branch and {DISMISSAL} is accumulated dismissal context (may be empty).

## A. Codex prompt (when codex:rescue is available — run as background Agent)

--model gpt-5.5 --effort xhigh
Review the code changes on the current branch vs {BASE}.
Run: git diff {BASE}...HEAD
Focus: correctness bugs, security vulnerabilities, concurrency issues, and test gaps.
Report problems only, each as file:line, issue, severity, and a fix suggestion.
{DISMISSAL — if non-empty: "Previously evaluated and dismissed (do not repeat): {DISMISSAL}.
Focus on NEW issues."}

## B. Adversarial Claude fallback (when codex:rescue is NOT available)

You are an adversarial reviewer. Your job is to REFUTE the claim that this change is correct
and safe. Assume the author was overconfident.
Run: git diff {BASE}...HEAD
Hunt specifically for: correctness bugs the author would have missed, security holes, unhandled
error/edge cases, and concurrency hazards. Be skeptical; prefer finding a real problem over
declaring it clean — but do not invent issues.
{DISMISSAL — if non-empty: "Previously evaluated and dismissed (do not repeat): {DISMISSAL}."}

For both prompts, end the reply with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"critical|major|minor"}]
```

- [ ] **Step 2: Wire the handler** — in `skills/planasaurus-run/SKILL.md`, replace the `codex` TODO block with:

````markdown
### codex  → `{dismissalContext}`
- Read `${CLAUDE_PLUGIN_ROOT}/agents/external-review.md`. Substitute `{BASE}` (from state.json) and
  `{DISMISSAL}` (= `action.dismissalContext`).
- Choose the reviewer:
  - If `codex:rescue` (or `codex:codex-rescue`) appears in the available skills/agents list, spawn it
    as a BACKGROUND Agent (`subagent_type: "codex:codex-rescue"`, `run_in_background: true`) using
    prompt A. The user keeps interactivity; you are notified on completion.
  - Otherwise, spawn an adversarial Claude Agent (foreground) using prompt B. Set `model` to a
    different tier than the implementer used (e.g. opus if tasks ran on sonnet) for perspective diversity.
- When the reviewer completes, collect its `FINDINGS:` JSON.
- VERIFY each finding (read the code, ~20 lines context). Classify confirmed / false positive.
- FIX confirmed findings. Run tests + lint (must pass; retry once on failure). Do NOT commit here —
  fixes accumulate; the binary will emit a `commit` action when the codex phase ends.
- Record false-positive reasons into the dismissal context you return.
- OUTCOME:
  `{"result": "<r>", "findings": [{"file","line","issue","confirmed":bool,"fixed":bool}], "dismissalContext": "<reasons>"}`
  where `<r>` = `clean` (no findings), `fixed` (confirmed issues fixed), `dismissed` (all false positives),
  or `failed` (confirmed issues could not be fixed / tests won't pass).
````

- [ ] **Step 3: Validate** — `cd /Users/antonkundenko/data/work/planasaurus && grep -c "TODO(Task 5)" skills/planasaurus-run/SKILL.md` → Expected: `0`.

- [ ] **Step 4: Commit**

```bash
git add agents/external-review.md skills/planasaurus-run/SKILL.md
git commit -m "feat: add external review agent with codex+adversarial fallback and wire codex handler"
```

---

## Task 6: Pipeline contract test

**Files:**
- Create: `test/pipeline.test.mjs`

The plan-1 e2e test covered a "happy" run where codex came back clean. This test exercises the paths the dispatcher most relies on but e2e did not: a codex `fixed` → `commit` (flag-clear) → second-pass `clean`, and a two-round review (findings then clean). It drives the pure functions (`computeNext` + `applyOutcome`) exactly as the dispatcher would, asserting the action sequence — proving the dispatcher's contract is sound without spawning real subagents.

- [ ] **Step 1: Write the failing test**

`test/pipeline.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNext } from '../src/transition.mjs';
import { applyOutcome } from '../src/record.mjs';
import { defaultState } from '../src/state.mjs';
import { readLedger } from '../src/io.mjs'; // not used for disk; ledger kept in-memory below

// Simulate the dispatcher: keep state + ledger in memory, drive next/record.
function makeDriver(plan) {
  let state = defaultState({ plan: 'p.md', baseBranch: 'main', featureBranch: 'feat', config: { maxIterations: 50, skipCodex: false } });
  const ledger = [];
  return {
    next() {
      const r = computeNext(state, plan, ledger);
      state = r.state;
      return r.action;
    },
    record(action, outcome) {
      const r = applyOutcome(state, action, outcome, ledger);
      state = r.state;
      ledger.push(...r.append);
    },
    get state() { return state; },
  };
}

test('codex fixed → commit clears the flag → second codex pass clean → advances', () => {
  // Plan with no tasks so we land in review quickly.
  const NO_TASKS = { taskUnchecked: 0, taskTotal: 0, otherUnchecked: 0 };
  const d = makeDriver(NO_TASKS);

  let a = d.next(); assert.equal(a.action, 'branch'); d.record(a, {});
  // task phase: no tasks → straight to review1
  a = d.next(); assert.equal(a.action, 'review'); assert.equal(a.mode, 'first');
  d.record(a, { findings: [] }); // clean review1 round 0
  // review1 converged (lastNew 0) → codex
  a = d.next(); assert.equal(a.action, 'codex');
  d.record(a, { result: 'fixed', findings: [{ file: 'x.js', line: 1, issue: 'bug', confirmed: true, fixed: true }] });
  // codex not done (fixed) → codex again
  a = d.next(); assert.equal(a.action, 'codex');
  d.record(a, { result: 'clean', findings: [] }); // now codexDone
  // codex done with pending fixes → commit
  a = d.next(); assert.equal(a.action, 'commit'); d.record(a, {});
  // flag cleared by record(commit) → advance to review2
  a = d.next(); assert.equal(a.action, 'review'); assert.equal(a.mode, 'second');
  d.record(a, { findings: [] });
  // review2 clean → finalize
  a = d.next(); assert.equal(a.action, 'finalize'); d.record(a, {});
  a = d.next(); assert.equal(a.action, 'done');
  assert.equal(a.summary.codexIters, 2);
  assert.equal(a.summary.findingsConfirmed, 1);
});

test('two-round review: findings then clean advances out of review1', () => {
  const NO_TASKS = { taskUnchecked: 0, taskTotal: 0, otherUnchecked: 0 };
  const d = makeDriver(NO_TASKS);
  let a = d.next(); assert.equal(a.action, 'branch'); d.record(a, {});
  a = d.next(); assert.equal(a.action, 'review'); // round 0
  d.record(a, { findings: [{ file: 'a.js', line: 2, issue: 'leak', confirmed: true, fixed: true }] });
  a = d.next(); assert.equal(a.action, 'review'); // round 1 (last round had a new finding)
  d.record(a, { findings: [{ file: 'a.js', line: 2, issue: 'leak', confirmed: true, fixed: true }] }); // same finding → 0 new
  a = d.next(); assert.equal(a.action, 'codex'); // converged: no new findings → advance
});
```

- [ ] **Step 2: Run to verify it fails (if at all)**

Run: `cd /Users/antonkundenko/data/work/planasaurus && node --test test/pipeline.test.mjs`
Expected: PASS if the binary from plan 1 is correct (these paths are already implemented). The unused `readLedger` import is harmless; if the linter or `node --test` warns about it, remove that import line — it is not needed (the ledger is kept in memory by the driver). If a test FAILS, it has found a real contract bug — debug the pure function (use `superpowers:systematic-debugging`), do not edit the test to pass.

- [ ] **Step 3: Clean up the import**

Remove the line `import { readLedger } from '../src/io.mjs';` from the test (it was only a scaffolding note). Re-run: `cd /Users/antonkundenko/data/work/planasaurus && node --test test/pipeline.test.mjs` → Expected: PASS.

- [ ] **Step 4: Run full suite**

Run: `cd /Users/antonkundenko/data/work/planasaurus && node --test` → Expected: all pass (43 tests: prior 41 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add test/pipeline.test.mjs
git commit -m "test: add dispatcher contract test for codex-commit and multi-round review paths"
```

---

## Task 7: README + strict validation

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write the README**

`README.md`:
```markdown
# planasaurus

Autonomous plan-execution pipeline for Claude Code. A deterministic state-machine binary
drives the control flow; subagents do the judgment (implement, review, fix). The whole run
stays in one session.

## How it works

`brainstorming` + `writing-plans` produce a plan file with `[ ]` task checkboxes. Then:

    /planasaurus:planasaurus-run docs/plans/your-plan.md

The dispatcher skill loops: it asks the binary (`bin/planasaurus.mjs`) what to do next,
runs that action (create branch, implement one task, multi-agent review, external review,
commit, finalize), records the outcome, and repeats until done. All loop state lives in
`.planasaurus/`, so a crash or context compaction resumes where it left off — just re-run
the same command.

Pipeline: branch → task loop → review (5 agents) → external review (codex or adversarial
Claude) → review (2 agents) → finalize.

## Flags

- `--skip-codex` — skip the external-review phase.
- `--max-iterations=N` — task iteration cap (default 50).

## External review

Uses the `codex:rescue` plugin if installed; otherwise falls back to an adversarial Claude
subagent on a different model tier. There is always a second opinion.

## Development

    node --test        # run the binary's test suite
```

- [ ] **Step 2: Validate strictly**

Run: `cd /Users/antonkundenko/data/work/planasaurus && claude plugin validate . --strict` (if `claude` is available).
Expected: passes with no warnings. If `claude` is unavailable, skip — note this in the commit body.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Task 8: Integration verification on a toy repo

**Files:** none (verification only)

This task confirms the assembled plugin actually runs. It is a guided manual run, not an automated test — prose skills can only be verified by execution.

- [ ] **Step 1: Build a toy repo with a tiny plan**

```bash
D=$(mktemp -d); cd "$D"; git init -q
git commit -q --allow-empty -m init; git branch -M main
mkdir -p docs/plans
cat > docs/plans/toy.md <<'EOF'
# Toy Plan
## Overview
A trivial change to prove the pipeline runs.
### Task 1: add a greeting module
- [ ] Create `greet.mjs` exporting `greet(name)` returning `"hello, " + name`
- [ ] Add `test/greet.test.mjs` asserting `greet("x") === "hello, x"`; run `node --test`
EOF
git add -A && git commit -q -m "add toy plan"
echo "$D"
```

- [ ] **Step 2: Dry-run the binary contract in the toy repo**

From the toy repo dir, confirm the binary initializes and emits the first action:
```bash
node /Users/antonkundenko/data/work/planasaurus/bin/planasaurus.mjs init docs/plans/toy.md --skip-codex
node /Users/antonkundenko/data/work/planasaurus/bin/planasaurus.mjs next   # expect {"action":"branch",...}
```
Expected: `init` prints `{"ok":true,...}` and writes `.planasaurus/state.json`; `next` prints a `branch` action. This confirms the binary half works in a fresh repo. (Full subagent-driven execution is exercised by actually invoking `/planasaurus:planasaurus-run docs/plans/toy.md --skip-codex` in a Claude Code session with the plugin loaded — record the result of that run in the commit message if performed.)

- [ ] **Step 3: Load the plugin and confirm discovery**

Run: `cd /Users/antonkundenko/data/work/planasaurus && claude plugin validate .` (final check). If available, confirm the skill is discoverable as `/planasaurus:planasaurus-run`.

- [ ] **Step 4: Record verification result**

Document what was verified (binary contract in toy repo: ✅; full session run: note whether performed) in a short commit:
```bash
cd /Users/antonkundenko/data/work/planasaurus
git commit --allow-empty -m "test: verify plugin loads and binary drives a toy plan"
```

---

## Self-Review Notes

- **Spec coverage:** every action the binary can emit (branch, task, review, codex, commit, finalize, done) has a dispatcher handler (Tasks 2–5). External review honors the chosen codex+adversarial-fallback design (Task 5). The contract test covers the codex-fix→commit→clean and multi-round-review paths e2e missed (Task 6).
- **Out of scope (deliberately):** the binary itself (plan 1, done), plan creation (brainstorming/writing-plans, upstream), worktree isolation, and any remote git beyond the final push the user drives.
- **Resumability:** the dispatcher's Setup/Resume step (Task 2) reads `.planasaurus/state.json` and continues if `phase != done`, matching the binary's disk-authoritative design.
- **Token discipline:** the dispatcher contains no control-flow logic — it only translates each action to a subagent or git command. Agent prompts live in `agents/*.md`, read by the spawned subagents, keeping the main SKILL.md small.
- **Naming consistency:** the skill is `planasaurus-run`; the binary is invoked as `node ${CLAUDE_PLUGIN_ROOT}/bin/planasaurus.mjs`; lens files are `agents/review-<lens>.md` referenced verbatim by the review handler. `{PLAN}`, `{BASE}`, `{DISMISSAL}` are the only substitution tokens and are consistent across files.
- **Verification honesty:** Task 8 is explicitly a manual/guided run — prose skills cannot be unit-tested. The automated guarantees come from the binary's suite (plan 1) plus the Task 6 contract test.
```
