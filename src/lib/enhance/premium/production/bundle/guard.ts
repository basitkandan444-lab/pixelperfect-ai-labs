// Build-time bundle guard helpers. Used by scripts/check-bundle-size.mjs to
// enforce that: (a) the free chunk contains none of the premium symbols; and
// (b) the premium chunk stays within its growth budget.
//
// Pure functions — take file lists and byte counts, return pass/fail. No I/O.

export interface ChunkInfo { name: string; bytes: number; gzipBytes?: number; }
export interface BundleReport {
  ok: boolean;
  violations: string[];
  chunks: ChunkInfo[];
}

export const FORBIDDEN_IN_FREE = [
  "premium/pipeline",
  "premium/intelligence",
  "premium/optimize",
  "premium/production",
  "premium/capabilities",
] as const;

export function checkFreeChunk(
  freeChunkSource: string,
  chunkName = "index",
): BundleReport {
  const violations: string[] = [];
  for (const marker of FORBIDDEN_IN_FREE) {
    if (freeChunkSource.includes(marker)) {
      violations.push(`free chunk (${chunkName}) contains ${marker}`);
    }
  }
  return { ok: violations.length === 0, violations, chunks: [] };
}

export function checkPremiumBudget(
  premiumBytesGz: number,
  budgetBytesGz: number,
  chunkName = "premium",
): BundleReport {
  const violations: string[] = [];
  if (premiumBytesGz > budgetBytesGz) {
    violations.push(
      `${chunkName} chunk ${premiumBytesGz}B gz exceeds budget ${budgetBytesGz}B gz`,
    );
  }
  return {
    ok: violations.length === 0,
    violations,
    chunks: [{ name: chunkName, bytes: premiumBytesGz }],
  };
}
