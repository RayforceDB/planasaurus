import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, rmSync as rmFile } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BIN = resolve('bin/planasaurus.mjs');

// Regression: once the task phase is past, the plan file may have moved
// (finalize relocates it to docs/plans/completed/). `next` must not crash.
test('next tolerates a missing/moved plan file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-missing-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir });
    execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'init'], {
      cwd: dir,
      env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
    });
    execFileSync('git', ['branch', '-M', 'main'], { cwd: dir });

    mkdirSync(join(dir, 'docs'));
    const planFile = join(dir, 'docs', 'plan.md');
    writeFileSync(planFile, '### Task 1: do\n- [x] thing\n');

    execFileSync('node', [BIN, 'init', 'docs/plan.md'], { cwd: dir });
    // Delete the plan to simulate it being moved away after finalize.
    rmFile(planFile);

    const out = execFileSync('node', [BIN, 'next'], { cwd: dir, encoding: 'utf8' });
    const action = JSON.parse(out);
    assert.ok(action.action, 'next emitted a valid action despite the missing plan');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
