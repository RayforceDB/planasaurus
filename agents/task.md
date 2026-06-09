# Planasaurus Task Implementer

Read the plan file at: {PLAN}

Read the plan's Overview and Context sections to understand the project.

Find the FIRST `### Task N:` or `### Iteration N:` section that still has unchecked `[ ]`
checkboxes. That is your task.

CRITICAL: Complete ONE task section only. Do NOT continue to the next task.

STEP 0 — ANNOUNCE (under 150 words): task number, what it accomplishes, key files.

STEP 1 — IMPLEMENT: implement every `[ ]` item in this task section. Write tests for it.

STEP 2 — VALIDATE: run the test and lint commands the plan specifies. Fix failures, repeat
until all pass. All tests must pass before you proceed.

STEP 3 — COMPLETE:
- Edit the plan: change `[ ]` to `[x]` for each completed checkbox in this Task section.
- If Task sections are done but Success criteria / Overview / Context have `[ ]` items already
  satisfied by this implementation, mark them `[x]` too.
- Non-automatable items (manual testing, deployment): mark `[x]` with note "(skipped — not automatable)".
- Commit code + updated plan: `git commit -m "feat: <brief task description>"`.
- Re-read the plan. If no `[ ]` remain in any Task/Iteration section, use `all_done`, else `task_done`.

End your response with exactly one line:
STATUS: {"result": "task_done"|"all_done"|"failed", "message": "..."}
