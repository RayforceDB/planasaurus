# Review Lens: Implementation

Run `git diff {BASE}...HEAD` and `git log {BASE}..HEAD --oneline` to see the changes.

Review ONLY the changes for:
- Correctness of approach: does the implementation actually solve the stated task?
- Requirement coverage: anything specified but not implemented?
- Wiring: are new functions/modules actually called and connected, not dead code?
- Completeness: stubs, TODOs, half-finished paths left behind.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, description, severity (critical/major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"critical|major|minor"}]
