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
