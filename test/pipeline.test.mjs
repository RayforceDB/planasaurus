import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeNext } from '../src/transition.mjs';
import { applyOutcome } from '../src/record.mjs';
import { defaultState } from '../src/state.mjs';

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
