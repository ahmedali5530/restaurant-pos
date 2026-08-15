/** Levenshtein distance between two strings. */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  const prev = new Array(t.length + 1);
  const curr = new Array(t.length + 1);

  for (let j = 0; j <= t.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= t.length; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[t.length];
}

/**
 * Similarity score in [0, 1] based on normalized Levenshtein distance.
 */
export function stringSimilarity(a: string, b: string): number {
  const left = a.trim();
  const right = b.trim();
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  const maxLen = Math.max(left.length, right.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(left, right) / maxLen;
}

export function findBestFuzzyMatch<T extends {label: string}>(
  needle: string,
  candidates: T[],
  minScore = 0.72
): {match: T; score: number} | null {
  let best: {match: T; score: number} | null = null;
  for (const candidate of candidates) {
    const score = stringSimilarity(needle, candidate.label);
    if (score < minScore) continue;
    if (!best || score > best.score) {
      best = {match: candidate, score};
    }
  }
  return best;
}
