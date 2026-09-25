import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

export interface Positioned {
  id: string;
  position: string;
}

/** Byte-wise comparison, matching how fractional-indexing keys must be ordered. */
export function comparePositions(a: Positioned, b: Positioned): number {
  if (a.position < b.position) return -1;
  if (a.position > b.position) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface PositionPlan {
  /** Sort key for the item being placed. */
  position: string;
  /** Existing siblings that must be re-keyed first (only when keys had collided). */
  rebalanced: Positioned[];
}

/**
 * Computes a sort key that places an item at `index` among `siblings` (which must not
 * contain the item itself). If neighbouring keys are identical — possible after two
 * concurrent inserts — all siblings are re-keyed.
 */
export function planPosition(siblings: Positioned[], index: number): PositionPlan {
  const sorted = [...siblings].sort(comparePositions);
  const i = Math.max(0, Math.min(index, sorted.length));
  const before = sorted[i - 1]?.position ?? null;
  const after = sorted[i]?.position ?? null;

  try {
    if (before === null || after === null || before < after) {
      return { position: generateKeyBetween(before, after), rebalanced: [] };
    }
  } catch {
    // Fall through to rebalancing on malformed keys.
  }

  const keys = generateNKeysBetween(null, null, sorted.length + 1);
  const rebalanced = sorted.map((s, n) => ({
    id: s.id,
    position: keys[n < i ? n : n + 1]!,
  }));
  return { position: keys[i]!, rebalanced };
}
