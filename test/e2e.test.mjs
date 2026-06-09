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
