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

test('commit outcome clears pendingCodexFixes (so next stops re-emitting it)', () => {
  const { state } = applyOutcome(freshState({ pendingCodexFixes: true }), { action: 'commit' }, {}, []);
  assert.equal(state.pendingCodexFixes, false);
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
