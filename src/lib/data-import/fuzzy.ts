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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Containment / token score in [0, 1].
 * Prefers candidates that appear as whole words in the input, especially as a
 * prefix (e.g. "Main" beats "Store" for "Main store").
 */
export function containmentScore(needle: string, candidate: string): number {
  const n = needle.trim().toLowerCase();
  const c = candidate.trim().toLowerCase();
  if (!n || !c || c.length < 2) return 0;
  if (n === c) return 1;

  // Candidate as a whole word inside the needle
  const inNeedle = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(c)}(?:[^a-z0-9]|$)`,
    "i"
  );
  if (inNeedle.test(n)) {
    const prefix =
      n.startsWith(c) &&
      (n.length === c.length || /[^a-z0-9]/i.test(n[c.length] ?? ""));
    const ratio = c.length / n.length;
    return Math.min(0.99, 0.55 + ratio * 0.3 + (prefix ? 0.35 : 0));
  }

  // Needle as a whole word inside the candidate
  const inCandidate = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegExp(n)}(?:[^a-z0-9]|$)`,
    "i"
  );
  if (n.length >= 2 && inCandidate.test(c)) {
    return Math.min(0.99, 0.55 + (n.length / c.length) * 0.3);
  }

  return 0;
}

export type SmartMatchResult<T extends {label: string}> =
  | {kind: "match"; match: T; score: number; exact: boolean}
  | {kind: "ambiguous"; candidates: T[]; score: number};

const AMBIGUITY_MARGIN = 0.05;
const CONTAINMENT_MIN = 0.55;

/**
 * Smart match: exact CI → containment/token → Levenshtein fuzzy.
 * Returns ambiguous when two strong candidates are within a tight score margin.
 */
export function findBestSmartMatch<T extends {label: string}>(
  needle: string,
  candidates: T[],
  fuzzyMinScore = 0.72
): SmartMatchResult<T> | null {
  const trimmed = needle.trim();
  if (!trimmed || candidates.length === 0) return null;

  const lower = trimmed.toLowerCase();
  const exactHits = candidates.filter((c) => c.label.trim().toLowerCase() === lower);
  if (exactHits.length === 1) {
    return {kind: "match", match: exactHits[0], score: 1, exact: true};
  }
  if (exactHits.length > 1) {
    return {kind: "ambiguous", candidates: exactHits, score: 1};
  }

  type Scored = {match: T; score: number};
  const scored: Scored[] = [];

  for (const candidate of candidates) {
    const contain = containmentScore(trimmed, candidate.label);
    const fuzzy = stringSimilarity(trimmed, candidate.label);
    const score = Math.max(
      contain >= CONTAINMENT_MIN ? contain : 0,
      fuzzy >= fuzzyMinScore ? fuzzy : 0
    );
    if (score > 0) {
      scored.push({match: candidate, score});
    }
  }

  if (scored.length === 0) return null;

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Prefer longer canonical labels when scores tie (more specific)
    return b.match.label.length - a.match.label.length;
  });

  const best = scored[0];
  const close = scored.filter((s) => best.score - s.score <= AMBIGUITY_MARGIN);
  if (close.length > 1) {
    // Prefer longest label when scores are close (e.g. "Main" vs "Ma")
    const byLength = [...close].sort(
      (a, b) => b.match.label.length - a.match.label.length
    );
    const longest = byLength[0];
    const longestPeers = byLength.filter(
      (s) => s.match.label.length === longest.match.label.length
    );
    if (longestPeers.length === 1 && longest.score >= best.score - AMBIGUITY_MARGIN) {
      return {
        kind: "match",
        match: longest.match,
        score: longest.score,
        exact: false,
      };
    }
    return {
      kind: "ambiguous",
      candidates: close.map((s) => s.match),
      score: best.score,
    };
  }

  return {kind: "match", match: best.match, score: best.score, exact: false};
}
