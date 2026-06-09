# planasaurus

Autonomous plan-execution pipeline for Claude Code. A deterministic state-machine binary
drives the control flow; subagents do the judgment (implement, review, fix). The whole run
stays in one session.

## How it works

`brainstorming` + `writing-plans` produce a plan file with `[ ]` task checkboxes. Then:

    /planasaurus:run docs/plans/your-plan.md

The dispatcher skill loops: it asks the binary (`bin/planasaurus.mjs`) what to do next,
runs that action (create branch, implement one task, multi-agent review, external review,
commit, finalize), records the outcome, and repeats until done. All loop state lives in
`.planasaurus/`, so a crash or context compaction resumes where it left off — just re-run
the same command.

Pipeline: branch → task loop → review (5 agents) → external review (codex or adversarial
Claude) → review (2 agents) → finalize.

## Flags

- `--skip-codex` — skip the external-review phase.
- `--max-iterations=N` — task iteration cap (default 50).

## External review

Uses the `codex:rescue` plugin if installed; otherwise falls back to an adversarial Claude
subagent on a different model tier. There is always a second opinion.

## Development

    node --test        # run the binary's test suite
