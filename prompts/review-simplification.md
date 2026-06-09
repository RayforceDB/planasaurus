# Review Lens: Simplification

Run `git diff {BASE}...HEAD` to see the changes.

Review ONLY the changes for over-engineering:
- Unnecessary abstractions or indirection for a simple problem.
- Enterprise patterns where a direct solution works.
- Premature optimization, speculative generality, YAGNI violations.
- Scope creep beyond the stated task.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, description, severity (major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"major|minor"}]
