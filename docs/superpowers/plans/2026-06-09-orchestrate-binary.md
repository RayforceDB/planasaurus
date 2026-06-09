# Planasaurus Orchestrate Binary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic `planasaurus` orchestrate binary — a compiled state machine that drives a ralphex-style plan-execution loop (task → review → codex → review → finalize) without spending any LLM tokens on control flow.

**Architecture:** A Node single-runtime CLI (`.mjs`, zero npm deps, runs under the Node/Bun already shipped with Claude Code). All transition logic lives in pure functions (`computeNext`, `applyOutcome`) unit-tested with `node --test`. The binary owns only its scratch dir `.planasaurus/` (`state.json` + `findings.jsonl`); it never mutates user source or runs git. A future skill acts as a dumb dispatcher: call `next` → run the named subagent → pipe the outcome to `record` → repeat. Because every decision derives from disk state, the loop is crash- and compaction-resumable.

**Tech Stack:** Node ≥18 (ESM, `node:test`, `node:assert/strict`, `node:fs`), no external dependencies.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | ESM module, `bin` entry, `test` script |
| `bin/planasaurus.mjs` | CLI glue only: read files → call pure fns → write files → print JSON |
| `src/plan.mjs` | `analyzePlan(text)` — count checked/unchecked Task vs other checkboxes |
| `src/state.mjs` | `branchNameFromPlan`, `parseInitArgs`, `defaultState` |
| `src/ledger.mjs` | `findingKey`, `countNew` — finding dedupe |
| `src/transition.mjs` | `computeNext(state, plan, ledger)` — THE state machine (pure) |
| `src/record.mjs` | `applyOutcome(state, action, outcome, ledger)` — fold an outcome into state (pure) |
| `src/io.mjs` | filesystem helpers (read/write state, append ledger) — the only side effects |
| `test/*.test.mjs` | one test file per `src` module + one end-to-end test |

`src/*` modules are pure (except `io.mjs`). `bin` is the only place files and stdin are touched. This keeps the brain trivially testable against fixture inputs.

### The `next` action contract (the spine)

`computeNext` returns exactly one action object:

```jsonc
{"action":"branch",   "name":"fix-issues", "base":"main"}
{"action":"task",     "plan":"docs/plans/x.md"}
{"action":"review",   "mode":"first"|"second"}
{"action":"codex",    "dismissalContext":"..."}
{"action":"commit",   "message":"fix: address codex review findings"}
{"action":"finalize", "plan":"docs/plans/x.md"}
{"action":"done",     "summary":{...}}
```

`record` consumes `{action, outcome}` where `outcome` is the action's result:
- task → `{"result":"task_done"|"all_done"|"failed"}`
- review → `{"findings":[{file,line,issue,confirmed,fixed}]}`
- codex → `{"result":"clean"|"fixed"|"dismissed"|"failed","findings":[...],"dismissalContext":"..."}`

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `test/smoke.test.mjs`
- Create: `src/.gitkeep`, `bin/.gitkeep`

- [ ] **Step 1: Write the failing test**

`test/smoke.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node test runner works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test`
Expected: FAIL — `Cannot find package` / no `package.json` with `"type":"module"`, so the `import` fails to resolve as ESM.

- [ ] **Step 3: Write minimal implementation**

`package.json`:
```json
{
  "name": "planasaurus",
  "version": "0.1.0",
  "description": "Deterministic state machine that drives a plan-execution loop for Claude Code.",
  "type": "module",
  "bin": { "planasaurus": "bin/planasaurus.mjs" },
  "scripts": { "test": "node --test" },
  "license": "MIT"
}
```

Create empty placeholder dirs so the layout is committed:
```bash
mkdir -p src bin test
touch src/.gitkeep bin/.gitkeep
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test`
Expected: PASS — 1 test passing.

- [ ] **Step 5: Commit**

```bash
git add package.json test/smoke.test.mjs src/.gitkeep bin/.gitkeep
git commit -m "chore: scaffold planasaurus node project"
```

---

## Task 2: Plan checkbox analyzer

**Files:**
- Create: `src/plan.mjs`
- Test: `test/plan.test.mjs`

`analyzePlan` walks markdown lines. A `### Task N:` / `### Iteration N:` heading opens a "task section"; any other `### ` heading or any `## ` heading closes it. Checkboxes (`- [ ]` / `- [x]`) are counted as task vs other, checked vs unchecked.

- [ ] **Step 1: Write the failing test**

`test/plan.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzePlan } from '../src/plan.mjs';

const PLAN = `# Feature
## Overview
- [ ] understand the goal
### Task 1: first
- [x] do a thing
- [ ] do another thing
### Task 2: second
- [x] done item
## Success criteria
- [ ] ship it
`;

test('counts unchecked task checkboxes', () => {
  const r = analyzePlan(PLAN);
  assert.equal(r.taskUnchecked, 1);
  assert.equal(r.taskTotal, 3);
});

test('counts non-task unchecked checkboxes separately', () => {
  const r = analyzePlan(PLAN);
  assert.equal(r.otherUnchecked, 2); // Overview + Success criteria
});

test('handles Iteration headings and uppercase X', () => {
  const r = analyzePlan('### Iteration 5: x\n- [X] big\n- [ ] small\n');
  assert.equal(r.taskTotal, 2);
  assert.equal(r.taskUnchecked, 1);
});

test('empty plan is all zeros', () => {
  const r = analyzePlan('# nothing here\n');
  assert.deepEqual(r, { taskUnchecked: 0, taskTotal: 0, otherUnchecked: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plan.test.mjs`
Expected: FAIL — `Cannot find module '../src/plan.mjs'`.

- [ ] **Step 3: Write minimal implementation**

`src/plan.mjs`:
```js
const TASK_HEADING = /^###\s+(Task|Iteration)\s+\d+/i;
const ANY_H3 = /^###\s+/;
const ANY_H2 = /^##\s+/;
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]/;

// Returns { taskUnchecked, taskTotal, otherUnchecked }.
export function analyzePlan(text) {
  const lines = String(text).split('\n');
  let inTask = false;
  let taskUnchecked = 0;
  let taskTotal = 0;
  let otherUnchecked = 0;

  for (const line of lines) {
    if (ANY_H2.test(line)) inTask = false;
    else if (ANY_H3.test(line)) inTask = TASK_HEADING.test(line);

    const m = line.match(CHECKBOX);
    if (m) {
      const checked = m[1].toLowerCase() === 'x';
      if (inTask) {
        taskTotal++;
        if (!checked) taskUnchecked++;
      } else if (!checked) {
        otherUnchecked++;
      }
    }
  }
  return { taskUnchecked, taskTotal, otherUnchecked };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/plan.test.mjs`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/plan.mjs test/plan.test.mjs
git commit -m "feat: add plan checkbox analyzer"
```

---

## Task 3: State helpers

**Files:**
- Create: `src/state.mjs`
- Test: `test/state.test.mjs`

`branchNameFromPlan` derives a branch from the plan filename (strip dir, `.md`, leading date prefix). `parseInitArgs` parses `init` CLI args. `defaultState` builds the initial state object.

- [ ] **Step 1: Write the failing test**

`test/state.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchNameFromPlan, parseInitArgs, defaultState } from '../src/state.mjs';

test('branch name strips date prefix and extension', () => {
  assert.equal(branchNameFromPlan('docs/plans/2026-06-09-fix-issues.md'), 'fix-issues');
  assert.equal(branchNameFromPlan('20260609-auth-refactor.md'), 'auth-refactor');
  assert.equal(branchNameFromPlan('bugfix.md'), 'bugfix');
});

test('branch name falls back when all digits/hyphens', () => {
  assert.equal(branchNameFromPlan('2026-06-09.md'), '2026-06-09');
});

test('parseInitArgs reads plan and flags', () => {
  const a = parseInitArgs(['plan.md', '--skip-codex', '--max-iterations=25']);
  assert.equal(a.plan, 'plan.md');
  assert.equal(a.config.skipCodex, true);
  assert.equal(a.config.maxIterations, 25);
});

test('parseInitArgs applies defaults', () => {
  const a = parseInitArgs(['plan.md']);
  assert.equal(a.config.skipCodex, false);
  assert.equal(a.config.maxIterations, 50);
});

test('parseInitArgs throws without a plan file', () => {
  assert.throws(() => parseInitArgs(['--skip-codex']), /plan file/i);
});

test('defaultState starts in branch phase with zeroed counters', () => {
  const s = defaultState({ plan: 'plan.md', baseBranch: 'main', featureBranch: 'feat', config: { maxIterations: 50, skipCodex: false } });
  assert.equal(s.phase, 'branch');
  assert.equal(s.branchCreated, false);
  assert.equal(s.counters.taskIter, 0);
  assert.deepEqual(s.dismissalContext, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/state.test.mjs`
Expected: FAIL — `Cannot find module '../src/state.mjs'`.

- [ ] **Step 3: Write minimal implementation**

`src/state.mjs`:
```js
export function branchNameFromPlan(planPath) {
  const base = String(planPath).split('/').pop().replace(/\.md$/i, '');
  const stripped = base.replace(/^[\d-]+/, '');
  return stripped.length > 0 ? stripped : base;
}

export function parseInitArgs(args) {
  let plan = null;
  const config = { maxIterations: 50, skipCodex: false };
  for (const arg of args) {
    if (arg === '--skip-codex') config.skipCodex = true;
    else if (arg.startsWith('--max-iterations=')) {
      const n = Number.parseInt(arg.split('=')[1], 10);
      if (Number.isInteger(n) && n > 0) config.maxIterations = n;
    } else if (!arg.startsWith('--') && arg.endsWith('.md')) {
      plan = arg;
    }
  }
  if (!plan) throw new Error('init requires a plan file (path ending in .md)');
  return { plan, config };
}

export function defaultState({ plan, baseBranch, featureBranch, config }) {
  return {
    version: 1,
    plan,
    baseBranch,
    featureBranch,
    phase: 'branch',
    config: { maxIterations: 50, skipCodex: false, ...config },
    counters: { taskIter: 0, review1Round: 0, codexIter: 0, review2Round: 0 },
    review1LastNew: null,
    review2LastNew: null,
    branchCreated: false,
    dismissalContext: [],
    pendingCodexFixes: false,
    codexDone: false,
    finalized: false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/state.test.mjs`
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/state.mjs test/state.test.mjs
git commit -m "feat: add state helpers (branch derivation, arg parsing, default state)"
```

---

## Task 4: Finding ledger

**Files:**
- Create: `src/ledger.mjs`
- Test: `test/ledger.test.mjs`

`findingKey` normalizes a finding to a dedupe key (`file:line:issue-prefix`). `countNew` returns the subset of incoming findings whose key is not already present in the existing ledger.

- [ ] **Step 1: Write the failing test**

`test/ledger.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findingKey, countNew } from '../src/ledger.mjs';

test('findingKey is stable across whitespace and case', () => {
  const a = findingKey({ file: 'a.js', line: 10, issue: 'Off-by-one  ERROR' });
  const b = findingKey({ file: 'a.js', line: 10, issue: 'off-by-one error' });
  assert.equal(a, b);
});

test('countNew returns only unseen findings', () => {
  const existing = [{ file: 'a.js', line: 10, issue: 'leak' }];
  const incoming = [
    { file: 'a.js', line: 10, issue: 'leak' },     // dup
    { file: 'b.js', line: 5, issue: 'race' },       // new
  ];
  const fresh = countNew(existing, incoming);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].file, 'b.js');
});

test('countNew on empty existing returns all incoming', () => {
  const incoming = [{ file: 'a.js', line: 1, issue: 'x' }];
  assert.equal(countNew([], incoming).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ledger.test.mjs`
Expected: FAIL — `Cannot find module '../src/ledger.mjs'`.

- [ ] **Step 3: Write minimal implementation**

`src/ledger.mjs`:
```js
export function findingKey(f) {
  const file = String(f.file ?? '').trim();
  const line = String(f.line ?? '').trim();
  const issue = String(f.issue ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${file}:${line}:${issue}`;
}

export function countNew(existing, incoming) {
  const seen = new Set(existing.map(findingKey));
  return incoming.filter((f) => !seen.has(findingKey(f)));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ledger.test.mjs`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/ledger.mjs test/ledger.test.mjs
git commit -m "feat: add finding ledger dedupe helpers"
```

---

## Task 5: State machine — framework + branch + task phases

**Files:**
- Create: `src/transition.mjs`
- Test: `test/transition.test.mjs`

`computeNext` clones state, then runs a handler loop: each phase handler returns either `{action}` (stop and emit) or `{next}` (advance phase and continue). This task lays the framework plus the `branch` and `task` handlers.

- [ ] **Step 1: Write the failing test**

`test/transition.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNext } from '../src/transition.mjs';
import { defaultState } from '../src/state.mjs';

function freshState(over = {}) {
  const s = defaultState({ plan: 'plan.md', baseBranch: 'main', featureBranch: 'feat', config: { maxIterations: 50, skipCodex: false } });
  return { ...s, ...over };
}
const NO_TASKS = { taskUnchecked: 0, taskTotal: 0, otherUnchecked: 0 };
const HAS_TASKS = { taskUnchecked: 2, taskTotal: 5, otherUnchecked: 0 };

test('branch phase emits branch action when not yet created', () => {
  const { action } = computeNext(freshState(), NO_TASKS, []);
  assert.equal(action.action, 'branch');
  assert.equal(action.name, 'feat');
  assert.equal(action.base, 'main');
});

test('after branch created, unchecked tasks emit task action', () => {
  const { action } = computeNext(freshState({ branchCreated: true }), HAS_TASKS, []);
  assert.equal(action.action, 'task');
  assert.equal(action.plan, 'plan.md');
});

test('task phase stops emitting tasks at max iterations', () => {
  const s = freshState({ branchCreated: true, counters: { taskIter: 50, review1Round: 0, codexIter: 0, review2Round: 0 } });
  const { action } = computeNext(s, HAS_TASKS, []);
  assert.notEqual(action.action, 'task'); // advanced past task phase
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/transition.test.mjs`
Expected: FAIL — `Cannot find module '../src/transition.mjs'`.

- [ ] **Step 3: Write minimal implementation**

`src/transition.mjs`:
```js
export function capOf(state) {
  return Math.max(3, Math.floor(state.config.maxIterations / 5));
}

function branchHandler(s) {
  if (!s.branchCreated) {
    return { action: { action: 'branch', name: s.featureBranch, base: s.baseBranch } };
  }
  return { next: 'task' };
}

function taskHandler(s, plan) {
  if (plan.taskUnchecked > 0 && s.counters.taskIter < s.config.maxIterations) {
    return { action: { action: 'task', plan: s.plan } };
  }
  return { next: 'review1' };
}

const HANDLERS = {
  branch: branchHandler,
  task: taskHandler,
};

export function computeNext(state, plan, ledger) {
  const s = structuredClone(state);
  // Forward-only phases guarantee termination.
  for (let guard = 0; guard < 32; guard++) {
    const handler = HANDLERS[s.phase];
    if (!handler) throw new Error(`no handler for phase: ${s.phase}`);
    const out = handler(s, plan, ledger);
    if (out.action) return { state: s, action: out.action };
    s.phase = out.next;
  }
  throw new Error('computeNext did not converge');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/transition.test.mjs`
Expected: FAIL on the third test with `no handler for phase: review1` — the framework works but `review1` is unimplemented. This confirms the loop advances correctly; the next task adds `review1`. To make Task 5 green in isolation, temporarily assert the throw:

Replace the third test body with:
```js
test('task phase advances past task at max iterations', () => {
  const s = freshState({ branchCreated: true, counters: { taskIter: 50, review1Round: 0, codexIter: 0, review2Round: 0 } });
  assert.throws(() => computeNext(s, HAS_TASKS, []), /review1/);
});
```

Run: `node --test test/transition.test.mjs`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/transition.mjs test/transition.test.mjs
git commit -m "feat: add transition framework with branch and task phases"
```

---

## Task 6: State machine — review handler (review1)

**Files:**
- Modify: `src/transition.mjs`
- Test: `test/transition.test.mjs`

A parameterized `reviewHandler(phaseKey, mode, nextPhase)` emits a `review` action while the phase has not converged. Convergence: run round 0 always (`LastNew === null`); keep going while the previous round found new issues AND round < cap; otherwise advance.

- [ ] **Step 1: Write the failing test**

Replace the temporary throw test from Task 5 with the real behavior, and add review tests. In `test/transition.test.mjs` replace the `'task phase advances past task at max iterations'` test with:
```js
test('task at max iterations advances into review1', () => {
  const s = freshState({ branchCreated: true, counters: { taskIter: 50, review1Round: 0, codexIter: 0, review2Round: 0 } });
  const { action } = computeNext(s, HAS_TASKS, []);
  assert.equal(action.action, 'review');
  assert.equal(action.mode, 'first');
});

test('review1 runs round 0 when no rounds have happened', () => {
  const s = freshState({ branchCreated: true, phase: 'review1' });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'review');
  assert.equal(action.mode, 'first');
});

test('review1 keeps looping while last round found new issues', () => {
  const s = freshState({ branchCreated: true, phase: 'review1', review1LastNew: 3, counters: { taskIter: 0, review1Round: 1, codexIter: 0, review2Round: 0 } });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'review');
});

test('review1 advances to codex when last round was clean', () => {
  const s = freshState({ branchCreated: true, phase: 'review1', review1LastNew: 0, counters: { taskIter: 0, review1Round: 1, codexIter: 0, review2Round: 0 } });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'codex'); // codex handler arrives next task; for now expect throw
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/transition.test.mjs`
Expected: FAIL — the `advances to codex` test errors with `no handler for phase: codex` (review1 now advances correctly but codex is unimplemented).

- [ ] **Step 3: Write minimal implementation**

In `src/transition.mjs`, add the review handler and register `review1`:
```js
function reviewHandler(phaseKey, mode, nextPhase) {
  return (s) => {
    const lastNew = s[`${phaseKey}LastNew`];
    const round = s.counters[`${phaseKey}Round`];
    const firstRun = lastNew === null || lastNew === undefined;
    const keepGoing = firstRun || (lastNew > 0 && round < capOf(s));
    if (keepGoing) return { action: { action: 'review', mode } };
    return { next: nextPhase };
  };
}
```
Update the `HANDLERS` map:
```js
const HANDLERS = {
  branch: branchHandler,
  task: taskHandler,
  review1: reviewHandler('review1', 'first', 'codex'),
};
```

To make this task green in isolation, change the `'advances to codex'` test's final assertion to:
```js
  assert.throws(() => computeNext(s, NO_TASKS, []), /codex/);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/transition.test.mjs`
Expected: PASS — all transition tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/transition.mjs test/transition.test.mjs
git commit -m "feat: add review phase handler with convergence"
```

---

## Task 7: State machine — codex handler

**Files:**
- Modify: `src/transition.mjs`
- Test: `test/transition.test.mjs`

The codex handler: if `skipCodex`, advance straight to review2. Else, while not `codexDone`, emit `codex` (with accumulated dismissal context). When done but fixes are pending, emit a `commit` action once, then advance to review2.

- [ ] **Step 1: Write the failing test**

Replace the `'advances to codex'` throw assertion from Task 6 with the real one, and add codex tests:
```js
test('review1 clean advances into codex action', () => {
  const s = freshState({ branchCreated: true, phase: 'review1', review1LastNew: 0, counters: { taskIter: 0, review1Round: 1, codexIter: 0, review2Round: 0 } });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'codex');
  assert.equal(action.dismissalContext, '');
});

test('codex passes accumulated dismissal context', () => {
  const s = freshState({ branchCreated: true, phase: 'codex', dismissalContext: ['handled by mw', 'covered by integ test'] });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'codex');
  assert.match(action.dismissalContext, /handled by mw/);
});

test('skipCodex jumps from codex straight to review2', () => {
  const s = freshState({ branchCreated: true, phase: 'codex', config: { maxIterations: 50, skipCodex: true } });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'review');
  assert.equal(action.mode, 'second');
});

test('codex done with pending fixes emits a commit action', () => {
  const s = freshState({ branchCreated: true, phase: 'codex', codexDone: true, pendingCodexFixes: true });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'commit');
  assert.match(action.message, /codex/i);
});

test('codex done without pending fixes advances to review2', () => {
  const s = freshState({ branchCreated: true, phase: 'codex', codexDone: true, pendingCodexFixes: false });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'review');
  assert.equal(action.mode, 'second');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/transition.test.mjs`
Expected: FAIL — the `skipCodex`/`review2` tests error with `no handler for phase: review2`, and the codex-action tests fail with `no handler for phase: codex`.

- [ ] **Step 3: Write minimal implementation**

In `src/transition.mjs`, add the codex handler and register `codex`:
```js
function codexHandler(s) {
  if (s.config.skipCodex) return { next: 'review2' };
  if (!s.codexDone) {
    return { action: { action: 'codex', dismissalContext: s.dismissalContext.join('\n') } };
  }
  if (s.pendingCodexFixes) {
    s.pendingCodexFixes = false; // emit the commit exactly once
    return { action: { action: 'commit', message: 'fix: address codex review findings' } };
  }
  return { next: 'review2' };
}
```
Update `HANDLERS`:
```js
const HANDLERS = {
  branch: branchHandler,
  task: taskHandler,
  review1: reviewHandler('review1', 'first', 'codex'),
  codex: codexHandler,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/transition.test.mjs`
Expected: FAIL still on the two `review2` tests with `no handler for phase: review2` — the codex-specific tests now pass. Temporarily change those two tests' assertions to `assert.throws(() => computeNext(s, NO_TASKS, []), /review2/);` to make the task green in isolation; Task 8 restores them.

Run: `node --test test/transition.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/transition.mjs test/transition.test.mjs
git commit -m "feat: add codex phase handler with dismissal accumulation and pending-commit"
```

---

## Task 8: State machine — review2, finalize, done

**Files:**
- Modify: `src/transition.mjs`
- Test: `test/transition.test.mjs`

Register `review2` (reusing `reviewHandler`), plus `finalize` and `done` handlers. `buildSummary` reports counters and confirmed/fixed finding counts.

- [ ] **Step 1: Write the failing test**

Restore the two temporarily-throwing `review2` assertions from Task 7 back to their real form (`assert.equal(action.action, 'review'); assert.equal(action.mode, 'second');`), then add:
```js
test('review2 clean advances to finalize action', () => {
  const s = freshState({ branchCreated: true, phase: 'review2', review2LastNew: 0, counters: { taskIter: 0, review1Round: 0, codexIter: 0, review2Round: 1 } });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'finalize');
  assert.equal(action.plan, 'plan.md');
});

test('finalized state reports done with a summary', () => {
  const s = freshState({ branchCreated: true, phase: 'finalize', finalized: true, codexDone: true });
  const ledger = [
    { phase: 'review1', confirmed: true, fixed: true },
    { phase: 'codex', confirmed: true, fixed: false },
  ];
  const { action } = computeNext(s, NO_TASKS, ledger);
  assert.equal(action.action, 'done');
  assert.equal(action.summary.findingsConfirmed, 2);
  assert.equal(action.summary.findingsFixed, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/transition.test.mjs`
Expected: FAIL — `no handler for phase: review2` and `no handler for phase: finalize`.

- [ ] **Step 3: Write minimal implementation**

In `src/transition.mjs`, add handlers and `buildSummary`, then register the remaining phases:
```js
function finalizeHandler(s) {
  if (!s.finalized) return { action: { action: 'finalize', plan: s.plan } };
  return { next: 'done' };
}

function buildSummary(s, ledger) {
  const confirmed = ledger.filter((f) => f.confirmed).length;
  const fixed = ledger.filter((f) => f.fixed).length;
  return {
    tasks: s.counters.taskIter,
    review1Rounds: s.counters.review1Round,
    codexIters: s.counters.codexIter,
    review2Rounds: s.counters.review2Round,
    findingsConfirmed: confirmed,
    findingsFixed: fixed,
  };
}

function doneHandler(s, plan, ledger) {
  return { action: { action: 'done', summary: buildSummary(s, ledger) } };
}
```
Update `HANDLERS`:
```js
const HANDLERS = {
  branch: branchHandler,
  task: taskHandler,
  review1: reviewHandler('review1', 'first', 'codex'),
  codex: codexHandler,
  review2: reviewHandler('review2', 'second', 'finalize'),
  finalize: finalizeHandler,
  done: doneHandler,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/transition.test.mjs`
Expected: PASS — full transition suite passing.

- [ ] **Step 5: Commit**

```bash
git add src/transition.mjs test/transition.test.mjs
git commit -m "feat: complete state machine with review2, finalize, and done"
```

---

## Task 9: Record — fold outcomes into state

**Files:**
- Create: `src/record.mjs`
- Test: `test/record.test.mjs`

`applyOutcome(state, action, outcome, ledger)` returns `{ state, append }`: a new state with counters/flags updated and `append`, the finding records to write to the ledger. It is pure; the CLI does the actual file append.

- [ ] **Step 1: Write the failing test**

`test/record.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOutcome } from '../src/record.mjs';
import { defaultState } from '../src/state.mjs';

function freshState(over = {}) {
  const s = defaultState({ plan: 'plan.md', baseBranch: 'main', featureBranch: 'feat', config: { maxIterations: 50, skipCodex: false } });
  return { ...s, ...over };
}

test('branch outcome marks branchCreated', () => {
  const { state } = applyOutcome(freshState(), { action: 'branch' }, {}, []);
  assert.equal(state.branchCreated, true);
});

test('task outcome increments taskIter', () => {
  const { state } = applyOutcome(freshState(), { action: 'task' }, { result: 'task_done' }, []);
  assert.equal(state.counters.taskIter, 1);
});

test('first review records new-finding count and increments round', () => {
  const action = { action: 'review', mode: 'first' };
  const outcome = { findings: [{ file: 'a.js', line: 1, issue: 'bug', confirmed: true, fixed: true }] };
  const { state, append } = applyOutcome(freshState(), action, outcome, []);
  assert.equal(state.review1LastNew, 1);
  assert.equal(state.counters.review1Round, 1);
  assert.equal(append.length, 1);
  assert.equal(append[0].phase, 'review1');
});

test('review dedupes against existing ledger for LastNew', () => {
  const action = { action: 'review', mode: 'first' };
  const ledger = [{ file: 'a.js', line: 1, issue: 'bug' }];
  const outcome = { findings: [{ file: 'a.js', line: 1, issue: 'bug' }] }; // already seen
  const { state } = applyOutcome(freshState(), action, outcome, ledger);
  assert.equal(state.review1LastNew, 0);
});

test('codex fixed sets pendingCodexFixes and increments iter', () => {
  const { state } = applyOutcome(freshState(), { action: 'codex' }, { result: 'fixed', findings: [] }, []);
  assert.equal(state.pendingCodexFixes, true);
  assert.equal(state.counters.codexIter, 1);
  assert.equal(state.codexDone, false);
});

test('codex dismissed accumulates dismissal context', () => {
  const outcome = { result: 'dismissed', dismissalContext: 'covered by mw', findings: [] };
  const { state } = applyOutcome(freshState(), { action: 'codex' }, outcome, []);
  assert.deepEqual(state.dismissalContext, ['covered by mw']);
  assert.equal(state.codexDone, false);
});

test('codex clean marks codexDone', () => {
  const { state } = applyOutcome(freshState(), { action: 'codex' }, { result: 'clean', findings: [] }, []);
  assert.equal(state.codexDone, true);
});

test('codex hits done at cap even when still fixing', () => {
  const s = freshState({ counters: { taskIter: 0, review1Round: 0, codexIter: 9, review2Round: 0 }, config: { maxIterations: 50, skipCodex: false } });
  const { state } = applyOutcome(s, { action: 'codex' }, { result: 'fixed', findings: [] }, []);
  assert.equal(state.counters.codexIter, 10); // cap = max(3, 50/5) = 10
  assert.equal(state.codexDone, true);
});

test('finalize outcome marks finalized', () => {
  const { state } = applyOutcome(freshState(), { action: 'finalize' }, {}, []);
  assert.equal(state.finalized, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/record.test.mjs`
Expected: FAIL — `Cannot find module '../src/record.mjs'`.

- [ ] **Step 3: Write minimal implementation**

`src/record.mjs`:
```js
import { countNew } from './ledger.mjs';
import { capOf } from './transition.mjs';

export function applyOutcome(state, action, outcome, ledger) {
  const s = structuredClone(state);
  let append = [];

  switch (action.action) {
    case 'branch':
      s.branchCreated = true;
      break;

    case 'task':
      s.counters.taskIter++;
      break;

    case 'review': {
      const phaseKey = action.mode === 'first' ? 'review1' : 'review2';
      const round = s.counters[`${phaseKey}Round`];
      const incoming = (outcome.findings || []).map((f) => ({ ...f, phase: phaseKey, round }));
      s[`${phaseKey}LastNew`] = countNew(ledger, incoming).length;
      s.counters[`${phaseKey}Round`]++;
      append = incoming;
      break;
    }

    case 'codex': {
      s.counters.codexIter++;
      const incoming = (outcome.findings || []).map((f) => ({ ...f, phase: 'codex', round: s.counters.codexIter }));
      append = incoming;
      if (outcome.dismissalContext) s.dismissalContext.push(outcome.dismissalContext);
      if (outcome.result === 'fixed') s.pendingCodexFixes = true;
      if (outcome.result === 'clean' || outcome.result === 'failed' || s.counters.codexIter >= capOf(s)) {
        s.codexDone = true;
      }
      break;
    }

    case 'commit':
      break;

    case 'finalize':
      s.finalized = true;
      break;

    default:
      throw new Error(`record: unknown action ${action.action}`);
  }

  return { state: s, append };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/record.test.mjs`
Expected: PASS — 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/record.mjs test/record.test.mjs
git commit -m "feat: add applyOutcome to fold action results into state"
```

---

## Task 10: IO helpers + CLI glue

**Files:**
- Create: `src/io.mjs`
- Create: `bin/planasaurus.mjs`
- Test: `test/io.test.mjs`

`io.mjs` is the only side-effecting module: read/write `state.json`, read plan text, read/append `findings.jsonl`. `bin/planasaurus.mjs` wires `init`/`next`/`record` to the pure functions.

- [ ] **Step 1: Write the failing test**

`test/io.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeState, readState, appendFindings, readLedger, STATE_DIR } from '../src/io.mjs';

test('writeState/readState round-trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'));
  try {
    writeState(dir, { phase: 'task', counters: {} });
    const s = readState(dir);
    assert.equal(s.phase, 'task');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('appendFindings then readLedger returns all records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'));
  try {
    appendFindings(dir, [{ file: 'a.js', line: 1, issue: 'x' }]);
    appendFindings(dir, [{ file: 'b.js', line: 2, issue: 'y' }]);
    const ledger = readLedger(dir);
    assert.equal(ledger.length, 2);
    assert.equal(ledger[1].file, 'b.js');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('readLedger on missing file returns empty array', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-'));
  try {
    assert.deepEqual(readLedger(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('STATE_DIR is the planasaurus scratch dir name', () => {
  assert.equal(STATE_DIR, '.planasaurus');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/io.test.mjs`
Expected: FAIL — `Cannot find module '../src/io.mjs'`.

- [ ] **Step 3: Write minimal implementation**

`src/io.mjs`:
```js
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_DIR = '.planasaurus';

function statePath(root) { return join(root, STATE_DIR, 'state.json'); }
function ledgerPath(root) { return join(root, STATE_DIR, 'findings.jsonl'); }

export function ensureDir(root) {
  mkdirSync(join(root, STATE_DIR), { recursive: true });
}

export function writeState(root, state) {
  ensureDir(root);
  writeFileSync(statePath(root), JSON.stringify(state, null, 2));
}

export function readState(root) {
  return JSON.parse(readFileSync(statePath(root), 'utf8'));
}

export function appendFindings(root, records) {
  if (!records || records.length === 0) return;
  ensureDir(root);
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  appendFileSync(ledgerPath(root), lines);
}

export function readLedger(root) {
  const p = ledgerPath(root);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

export function readPlan(planPath) {
  return readFileSync(planPath, 'utf8');
}
```

`bin/planasaurus.mjs`:
```js
#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { parseInitArgs, defaultState, branchNameFromPlan } from '../src/state.mjs';
import { analyzePlan } from '../src/plan.mjs';
import { computeNext } from '../src/transition.mjs';
import { applyOutcome } from '../src/record.mjs';
import { writeState, readState, appendFindings, readLedger, readPlan } from '../src/io.mjs';

const ROOT = process.cwd();

function detectBaseBranch() {
  for (const b of ['main', 'master', 'trunk', 'develop']) {
    try {
      execFileSync('git', ['rev-parse', '--verify', b], { stdio: 'ignore' });
      return b;
    } catch { /* try next */ }
  }
  return null;
}

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function cmdInit(args) {
  const { plan, config } = parseInitArgs(args);
  const baseBranch = detectBaseBranch();
  if (!baseBranch) {
    console.error('ERROR: no default branch (main/master/trunk/develop) found — resolve manually');
    process.exit(2);
  }
  const featureBranch = branchNameFromPlan(plan);
  const state = defaultState({ plan, baseBranch, featureBranch, config });
  writeState(ROOT, state);
  process.stdout.write(JSON.stringify({ ok: true, baseBranch, featureBranch }) + '\n');
}

function cmdNext() {
  const state = readState(ROOT);
  const plan = analyzePlan(readPlan(state.plan));
  const ledger = readLedger(ROOT);
  const { state: nextState, action } = computeNext(state, plan, ledger);
  writeState(ROOT, nextState);
  process.stdout.write(JSON.stringify(action) + '\n');
}

function cmdRecord() {
  const { action, outcome } = readStdin();
  if (!action) { console.error('ERROR: record needs {action, outcome} on stdin'); process.exit(2); }
  const state = readState(ROOT);
  const ledger = readLedger(ROOT);
  const { state: nextState, append } = applyOutcome(state, action, outcome || {}, ledger);
  appendFindings(ROOT, append);
  writeState(ROOT, nextState);
  process.stdout.write(JSON.stringify({ ok: true, recorded: append.length }) + '\n');
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'init': cmdInit(rest); break;
  case 'next': cmdNext(); break;
  case 'record': cmdRecord(); break;
  default:
    console.error('usage: planasaurus <init plan.md [flags] | next | record>');
    process.exit(2);
}
```

Add the missing `readFileSync` import at the top of `bin/planasaurus.mjs`:
```js
import { readFileSync } from 'node:fs';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/io.test.mjs`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/io.mjs bin/planasaurus.mjs test/io.test.mjs
git commit -m "feat: add io helpers and init/next/record CLI"
```

---

## Task 11: End-to-end loop integration test

**Files:**
- Test: `test/e2e.test.mjs`

Drive the binary through a full lifecycle in a temp dir: init → branch → task → review1 → codex → review2 → finalize → done, feeding outcomes via `record`, asserting the action sequence.

- [ ] **Step 1: Write the failing test**

`test/e2e.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BIN = resolve('bin/planasaurus.mjs');

function run(cwd, args, stdin) {
  return execFileSync('node', [BIN, ...args], { cwd, input: stdin ?? '', encoding: 'utf8' });
}
function next(cwd) { return JSON.parse(run(cwd, ['next'])); }
function record(cwd, action, outcome) {
  run(cwd, ['record'], JSON.stringify({ action, outcome }));
}

test('full pipeline reaches done', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-e2e-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    });
    execFileSync('git', ['branch', '-M', 'main'], { cwd: dir });

    mkdirSync(join(dir, 'docs'));
    const planFile = join(dir, 'docs', 'plan.md');
    writeFileSync(planFile, '### Task 1: do\n- [ ] thing\n');

    run(dir, ['init', 'docs/plan.md', '--max-iterations=50']);

    // branch
    let a = next(dir); assert.equal(a.action, 'branch');
    record(dir, a, {});

    // task — mark the checkbox done to simulate the agent's edit, then record
    a = next(dir); assert.equal(a.action, 'task');
    writeFileSync(planFile, '### Task 1: do\n- [x] thing\n');
    record(dir, a, { result: 'task_done' });

    // review1 round 0 → findings, then round 1 clean
    a = next(dir); assert.equal(a.action, 'review'); assert.equal(a.mode, 'first');
    record(dir, a, { findings: [{ file: 'x', line: 1, issue: 'bug', confirmed: true, fixed: true }] });
    a = next(dir); assert.equal(a.action, 'review');
    record(dir, a, { findings: [] }); // clean round

    // codex clean
    a = next(dir); assert.equal(a.action, 'codex');
    record(dir, a, { result: 'clean', findings: [] });

    // review2 clean immediately
    a = next(dir); assert.equal(a.action, 'review'); assert.equal(a.mode, 'second');
    record(dir, a, { findings: [] });

    // finalize then done
    a = next(dir); assert.equal(a.action, 'finalize');
    record(dir, a, {});
    a = next(dir); assert.equal(a.action, 'done');
    assert.equal(a.summary.tasks, 1);
    assert.equal(a.summary.findingsConfirmed, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/e2e.test.mjs`
Expected: FAIL initially only if a bug exists; if all prior tasks are correct it may pass. If it fails, debug with `superpowers:systematic-debugging` — the action sequence assertions pinpoint the wrong transition.

- [ ] **Step 3: Write minimal implementation**

No new implementation expected — this test validates the integration of Tasks 1–10. If it fails, fix the offending pure function (not the test) and re-run its unit suite.

- [ ] **Step 4: Run the full suite**

Run: `node --test`
Expected: PASS — all unit tests + e2e passing.

- [ ] **Step 5: Commit**

```bash
git add test/e2e.test.mjs
git commit -m "test: add end-to-end pipeline integration test"
```

---

## Self-Review Notes

- **Spec coverage:** branch / task / review1 / codex / review2 / finalize / done all have handlers (Tasks 5–8) and outcome folding (Task 9). Convergence (no-new-findings + cap), dismissal accumulation, and pending-codex-commit are covered. Resumability is structural — every `next` reads from disk (Task 10).
- **Out of scope (deliberately):** git side effects, plan-file mutation, subagent dispatch, and the skill layer. Those belong to the **second plan** (`planasaurus-skill`), which wires a dumb dispatcher skill to this binary's `init`/`next`/`record` contract.
- **Type consistency:** state field names (`review1LastNew`, `pendingCodexFixes`, `codexDone`, `finalized`, `counters.*`) are identical across `state.mjs`, `transition.mjs`, and `record.mjs`. `capOf` is defined once in `transition.mjs` and imported by `record.mjs`.
- **Note on incremental TDD (Tasks 5–8):** the state machine grows one handler per task, so a few tests temporarily assert `throws(/nextphase/)` and are rewritten to real assertions in the following task. This is intentional — it keeps each task green in isolation while building the forward-only phase chain.
