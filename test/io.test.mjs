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
