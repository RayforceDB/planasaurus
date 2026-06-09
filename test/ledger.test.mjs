import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findingKey, countNew } from '../src/ledger.mjs';

test('findingKey is stable across whitespace and case', () => {
  const a = findingKey({ file: 'a.js', line: 10, issue: 'Off-by-one  ERROR' });
  const b = findingKey({ file: 'a.js', line: 10, issue: 'off-by-one error' });
  assert.equal(a, b);
});

test('countNew returns only unseen findings', () => {
  const existing = [{ file: 'a.js', line: 10, issue: 'leak' }];
  const incoming = [
    { file: 'a.js', line: 10, issue: 'leak' },     // dup
    { file: 'b.js', line: 5, issue: 'race' },       // new
  ];
  const fresh = countNew(existing, incoming);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].file, 'b.js');
});

test('countNew on empty existing returns all incoming', () => {
  const incoming = [{ file: 'a.js', line: 1, issue: 'x' }];
  assert.equal(countNew([], incoming).length, 1);
});
