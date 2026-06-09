export function capOf(state) {
  return Math.max(3, Math.floor(state.config.maxIterations / 5));
}

function branchHandler(s) {
  if (!s.branchCreated) {
    return { action: { action: 'branch', name: s.featureBranch, base: s.baseBranch } };
  }
  return { next: 'task' };
}

function taskHandler(s, plan) {
  if (plan.taskUnchecked > 0 && s.counters.taskIter < s.config.maxIterations) {
    return { action: { action: 'task', plan: s.plan } };
  }
  return { next: 'review1' };
}

const HANDLERS = {
  branch: branchHandler,
  task: taskHandler,
};

export function computeNext(state, plan, ledger) {
  const s = structuredClone(state);
  // Forward-only phases guarantee termination.
  for (let guard = 0; guard < 32; guard++) {
    const handler = HANDLERS[s.phase];
    if (!handler) throw new Error(`no handler for phase: ${s.phase}`);
    const out = handler(s, plan, ledger);
    if (out.action) return { state: s, action: out.action };
    s.phase = out.next;
  }
  throw new Error('computeNext did not converge');
}
