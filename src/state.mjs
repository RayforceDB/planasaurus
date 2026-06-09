export function branchNameFromPlan(planPath) {
  const base = String(planPath).split('/').pop().replace(/\.md$/i, '');
  const stripped = base.replace(/^[\d-]+/, '');
  return stripped.length > 0 ? stripped : base;
}

export function parseInitArgs(args) {
  let plan = null;
  const config = { maxIterations: 50, skipCodex: false };
  for (const arg of args) {
    if (arg === '--skip-codex') config.skipCodex = true;
    else if (arg.startsWith('--max-iterations=')) {
      const n = Number.parseInt(arg.split('=')[1], 10);
      if (Number.isInteger(n) && n > 0) config.maxIterations = n;
    } else if (!arg.startsWith('--') && arg.endsWith('.md')) {
      plan = arg;
    }
  }
  if (!plan) throw new Error('init requires a plan file (path ending in .md)');
  return { plan, config };
}

export function defaultState({ plan, baseBranch, featureBranch, config }) {
  return {
    version: 1,
    plan,
    baseBranch,
    featureBranch,
    phase: 'branch',
    config: { maxIterations: 50, skipCodex: false, ...config },
    counters: { taskIter: 0, review1Round: 0, codexIter: 0, review2Round: 0 },
    review1LastNew: null,
    review2LastNew: null,
    branchCreated: false,
    dismissalContext: [],
    pendingCodexFixes: false,
    codexDone: false,
    finalized: false,
  };
}
