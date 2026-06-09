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
  assert.throws(() => computeNext(s, NO_TASKS, []), /review2/);
});

test('codex done with pending fixes emits a commit action', () => {
  const s = freshState({ branchCreated: true, phase: 'codex', codexDone: true, pendingCodexFixes: true });
  const { action } = computeNext(s, NO_TASKS, []);
  assert.equal(action.action, 'commit');
  assert.match(action.message, /codex/i);
});

test('codex done without pending fixes advances to review2', () => {
  const s = freshState({ branchCreated: true, phase: 'codex', codexDone: true, pendingCodexFixes: false });
  assert.throws(() => computeNext(s, NO_TASKS, []), /review2/);
});
