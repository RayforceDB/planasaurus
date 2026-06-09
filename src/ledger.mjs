export function findingKey(f) {
  const file = String(f.file ?? '').trim();
  const line = String(f.line ?? '').trim();
  const issue = String(f.issue ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `${file}:${line}:${issue}`;
}

export function countNew(existing, incoming) {
  const seen = new Set(existing.map(findingKey));
  return incoming.filter((f) => !seen.has(findingKey(f)));
}
