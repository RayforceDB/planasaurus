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
