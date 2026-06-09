<h1 align="center">🦕 planasaurus</h1>

<p align="center">
  <b>Autonomous plan execution for Claude Code that never leaves your session.</b><br>
  A deterministic state-machine binary drives the loop; subagents do the judgment.
</p>

<p align="center">
  <a href="https://planasaurus.rayforcedb.com">Website</a> ·
  <a href="#install">Install</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#design">Design</a>
</p>

---

planasaurus runs an implementation plan end-to-end — implement a task, run multi-agent
review, take an external second opinion, fix what's real, repeat — until the plan is done.
The control flow lives in a tiny compiled state machine, so Claude never spends tokens
deciding *what to do next*; it only implements, reviews, and fixes. Everything runs as
in-session subagents, so there's no external runner and no per-call billing.

## Install

In Claude Code:

```
/plugin marketplace add RayforceDB/planasaurus
/plugin install planasaurus@rayforce
```

## Usage

1. **Write a plan.** Use Claude Code's brainstorming + plan-writing flow to produce a plan
   file with `### Task N:` sections and `[ ]` checkboxes (under e.g. `docs/plans/`).
2. **Run it:**

   ```
   /planasaurus:run docs/plans/your-plan.md
   ```

   Flags:
   - `--skip-codex` — skip the external-review phase.
   - `--max-iterations=N` — task iteration cap (default 50).

3. **Walk away.** It creates a feature branch, implements each task (with tests and commits),
   runs review, takes an external opinion, fixes confirmed issues, and archives the plan.

Requires a git repository. If the run is interrupted (crash, context compaction), just
re-run the same command — it resumes from disk state.

## How it works

```
plan.md ─▶ branch ─▶ task loop ─▶ review (5 agents) ─▶ external review ─▶ review (2 agents) ─▶ finalize ─▶ done
```

The dispatcher skill is a dumb loop: it asks the binary `what next?`, performs the returned
action (git op, or spawn a subagent), records the outcome, and repeats. The binary
(`bin/planasaurus.mjs`) is the brain — it decides every phase transition, iteration count,
and convergence condition from state on disk.

| Action | Who does it |
|--------|-------------|
| branch / commit / finalize | the dispatcher, via git |
| task | a task-implementer subagent (one task per iteration) |
| review | 5 (or 2) parallel review lenses, then verify → fix |
| codex | `codex:rescue` if installed, else an adversarial Claude subagent on a different model tier |

## Design

Three principles, enforced by construction:

- **Zero tokens on control flow.** The state machine (`src/transition.mjs`) is a pure
  function over disk state. The model obeys one action at a time and cannot lose count.
- **One session, flat rate.** No `claude -p`, no spawned processes — only in-session
  subagents.
- **Crash-resumable.** All state lives in `.planasaurus/` (`state.json` + `findings.jsonl`).
  The loop is reconstructable from disk, so the conversation is disposable.
- **Never zero external review.** A missing codex plugin falls back to an adversarial
  reviewer rather than skipping the second opinion.

## Development

```
node --test                  # run the binary's test suite (44 tests)
claude plugin validate .     # validate the plugin + marketplace manifests
```

The deterministic core (`src/*.mjs`) is fully unit-tested; the dispatcher↔binary contract
is covered by `test/pipeline.test.mjs`, and the full pipeline has been dogfooded end-to-end
on a real repo.

### Known limitations

- Review convergence dedupes findings by `file:line:issue`; if review agents reword the
  same finding across rounds it can loop up to the iteration cap before converging.
- No remote git operations — you commit/push the resulting branch yourself.

## License

[MIT](LICENSE) · by [Rayforce](https://github.com/RayforceDB)
