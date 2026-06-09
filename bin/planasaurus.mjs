#!/usr/bin/env node
import { readFileSync } from 'node:fs';
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
