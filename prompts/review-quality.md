# Review Lens: Quality

Run `git diff {BASE}...HEAD` and `git log {BASE}..HEAD --oneline` to see the changes.

Review ONLY the changes for:
- Correctness: logic errors, off-by-one, wrong conditionals/operators, edge cases (empty/nil/boundary).
- Error handling: unchecked errors, silent failures, missing wrapping.
- Resource management: leaks, missing cleanup, incorrect release.
- Concurrency: races, deadlocks, goroutine/thread leaks.
- Security: input validation, injection (SQL/command/path), secret exposure, auth checks.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, a one-line description, severity (critical/major/minor), a fix suggestion.

End your response with exactly one line of machine-readable JSON:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"critical|major|minor"}]
(empty array if nothing found)
