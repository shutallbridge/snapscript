// "Did you mean": the closest name, chosen as Python 3.12's traceback module
// chooses it (Lib/traceback.py, _compute_suggestion_error). Names ignore case
// (ADR 0008), so they are compared by their keys, and a case flip never costs.

const MAX_CANDIDATE_ITEMS = 750;
const MAX_STRING_SIZE = 40;
const MOVE_COST = 2;
const CASE_COST = 1;

function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  if (a.toLowerCase() === b.toLowerCase()) return CASE_COST;
  return MOVE_COST;
}

/** Python's `_levenshtein_distance`: gives `maxCost + 1` once the distance is sure to pass `maxCost`. */
function levenshtein(a: string, b: string, maxCost: number): number {
  if (a === b) return 0;
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1;
  a = a.slice(pre);
  b = b.slice(pre);
  let post = 0;
  while (post < a.length && post < b.length && a[a.length - 1 - post] === b[b.length - 1 - post]) post += 1;
  a = a.slice(0, a.length - post);
  b = b.slice(0, b.length - post);
  if (a.length === 0 || b.length === 0) return MOVE_COST * (a.length + b.length);
  if (a.length > MAX_STRING_SIZE || b.length > MAX_STRING_SIZE) return maxCost + 1;
  if (b.length < a.length) [a, b] = [b, a];
  if ((b.length - a.length) * MOVE_COST > maxCost) return maxCost + 1;

  const row = Array.from({ length: a.length }, (_, i) => (i + 1) * MOVE_COST);
  let result = 0;
  for (let bIndex = 0; bIndex < b.length; bIndex += 1) {
    let distance = (result = bIndex * MOVE_COST);
    let minimum = Number.MAX_SAFE_INTEGER;
    for (let index = 0; index < a.length; index += 1) {
      const substitute = distance + substitutionCost(b[bIndex], a[index]);
      distance = row[index];
      const insertDelete = Math.min(result, distance) + MOVE_COST;
      result = Math.min(insertDelete, substitute);
      row[index] = result;
      if (result < minimum) minimum = result;
    }
    if (minimum > maxCost) return maxCost + 1;
  }
  return result;
}

/**
 * The closest of `candidates` to `wrong`, or `null` when none is close
 * enough. Ties go to the earlier candidate.
 */
export function closest(wrong: string, candidates: readonly string[]): string | null {
  if (candidates.length > MAX_CANDIDATE_ITEMS) return null;
  if (wrong.length > MAX_STRING_SIZE) return null;
  let bestDistance = wrong.length;
  let suggestion: string | null = null;
  for (const candidate of candidates) {
    if (candidate === wrong) continue;
    // No more than 1/3 of the involved characters should need changing.
    let maxDistance = Math.floor(((candidate.length + wrong.length + 3) * MOVE_COST) / 6);
    // Don't take matches already beaten.
    maxDistance = Math.min(maxDistance, bestDistance - 1);
    const distance = levenshtein(wrong, candidate, maxDistance);
    if (distance > maxDistance) continue;
    if (suggestion === null || distance < bestDistance) {
      suggestion = candidate;
      bestDistance = distance;
    }
  }
  return suggestion;
}
