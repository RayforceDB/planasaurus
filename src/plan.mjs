const TASK_HEADING = /^###\s+(Task|Iteration)\s+\d+/i;
const ANY_H3 = /^###\s+/;
const ANY_H2 = /^##\s+/;
const CHECKBOX = /^\s*[-*]\s+\[([ xX])\]/;

// Returns { taskUnchecked, taskTotal, otherUnchecked }.
export function analyzePlan(text) {
  const lines = String(text).split('\n');
  let inTask = false;
  let taskUnchecked = 0;
  let taskTotal = 0;
  let otherUnchecked = 0;

  for (const line of lines) {
    if (ANY_H2.test(line)) inTask = false;
    else if (ANY_H3.test(line)) inTask = TASK_HEADING.test(line);

    const m = line.match(CHECKBOX);
    if (m) {
      const checked = m[1].toLowerCase() === 'x';
      if (inTask) {
        taskTotal++;
        if (!checked) taskUnchecked++;
      } else if (!checked) {
        otherUnchecked++;
      }
    }
  }
  return { taskUnchecked, taskTotal, otherUnchecked };
}
