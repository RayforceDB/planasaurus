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

test('review1 advances to codex when last round was clean', () => {
  const s = freshState({ branchCreated: true, phase: 'review1', review1LastNew: 0, counters: { taskIter: 0, review1Round: 1, codexIter: 0, review2Round: 0 } });
  assert.throws(() => computeNext(s, NO_TASKS, []), /codex/);
});
