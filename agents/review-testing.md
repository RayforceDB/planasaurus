# Review Lens: Testing

Run `git diff {BASE}...HEAD` to see the changes.

Review ONLY the changes for:
- Coverage: are new behaviors and branches tested?
- Fake tests: assertions that can't fail, tests that mock the thing under test, tautologies.
- Edge cases: are boundaries, error paths, and empty inputs tested?

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line, description, severity (critical/major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"critical|major|minor"}]
