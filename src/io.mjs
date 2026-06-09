import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const STATE_DIR = '.planasaurus';

function statePath(root) { return join(root, STATE_DIR, 'state.json'); }
function ledgerPath(root) { return join(root, STATE_DIR, 'findings.jsonl'); }

export function ensureDir(root) {
  mkdirSync(join(root, STATE_DIR), { recursive: true });
}

export function writeState(root, state) {
  ensureDir(root);
  writeFileSync(statePath(root), JSON.stringify(state, null, 2));
}

export function readState(root) {
  return JSON.parse(readFileSync(statePath(root), 'utf8'));
}

export function appendFindings(root, records) {
  if (!records || records.length === 0) return;
  ensureDir(root);
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  appendFileSync(ledgerPath(root), lines);
}

export function readLedger(root) {
  const p = ledgerPath(root);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l));
}

export function readPlan(planPath) {
  return readFileSync(planPath, 'utf8');
}
