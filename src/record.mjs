import { countNew } from './ledger.mjs';
import { capOf } from './transition.mjs';

export function applyOutcome(state, action, outcome, ledger) {
  const s = structuredClone(state);
  let append = [];

  switch (action.action) {
    case 'branch':
      s.branchCreated = true;
      break;

    case 'task':
      s.counters.taskIter++;
      break;

    case 'review': {
      const phaseKey = action.mode === 'first' ? 'review1' : 'review2';
      const round = s.counters[`${phaseKey}Round`];
      const incoming = (outcome.findings || []).map((f) => ({ ...f, phase: phaseKey, round }));
      s[`${phaseKey}LastNew`] = countNew(ledger, incoming).length;
      s.counters[`${phaseKey}Round`]++;
      append = incoming;
      break;
    }

    case 'codex': {
      s.counters.codexIter++;
      const incoming = (outcome.findings || []).map((f) => ({ ...f, phase: 'codex', round: s.counters.codexIter }));
      append = incoming;
      if (outcome.dismissalContext) s.dismissalContext.push(outcome.dismissalContext);
      if (outcome.result === 'fixed') s.pendingCodexFixes = true;
      if (outcome.result === 'clean' || outcome.result === 'failed' || s.counters.codexIter >= capOf(s)) {
        s.codexDone = true;
      }
      break;
    }

    case 'commit':
      break;

    case 'finalize':
      s.finalized = true;
      break;

    default:
      throw new Error(`record: unknown action ${action.action}`);
  }

  return { state: s, append };
}
