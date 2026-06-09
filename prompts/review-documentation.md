# Review Lens: Documentation

Run `git diff {BASE}...HEAD` to see the changes.

Review ONLY for documentation gaps introduced by these changes:
- New behavior/flags/config not reflected in README or CLAUDE.md.
- Plan file checkboxes left unchecked for work that is actually done.
- Public functions/modules lacking a short doc comment where the codebase expects one.

Report problems only — no praise. This is report-only: do NOT edit files.

For each issue: file:line (or file), description, severity (major/minor), fix suggestion.

End your response with exactly one line:
FINDINGS: [{"file":"path","line":N,"issue":"short text","severity":"major|minor"}]
