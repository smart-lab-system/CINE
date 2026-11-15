/**
 * Parse similarity from a JPlag `.jplag` report (zip).
 * JPlag 6.x ships `topComparisons.json` (not always `overview.json`).
 */

export type JplagSimilarityResult = {
  similarity: number;
  firstSubmission: string | null;
  secondSubmission: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pickSimilarity(similarities: unknown): number | null {
  const rec = asRecord(similarities);
  if (!rec) return null;
  for (const key of ['AVG', 'MAX', 'avg', 'max', 'averageSimilarity', 'maximalSimilarity']) {
    const n = Number(rec[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function nameOf(side: unknown): string | null {
  if (typeof side === 'string') return side;
  const rec = asRecord(side);
  if (!rec) return null;
  if (typeof rec.name === 'string') return rec.name;
  if (typeof rec.id === 'string') return rec.id;
  return null;
}

function collectComparisons(root: unknown): unknown[] {
  if (Array.isArray(root)) return root;
  const rec = asRecord(root);
  if (!rec) return [];
  const lists: unknown[] = [];
  for (const key of [
    'topComparisons',
    'top_comparisons',
    'comparisons',
  ]) {
    if (Array.isArray(rec[key])) lists.push(...(rec[key] as unknown[]));
  }
  return lists;
}

/**
 * Extract the best pairwise similarity from overview / topComparisons JSON.
 * Prefers pairs involving both `extension` and `compare` submission folders.
 */
export function similarityFromOverviewJson(
  overview: unknown,
  preferredNames: { a: string; b: string } = { a: 'extension', b: 'compare' },
): JplagSimilarityResult {
  const lists = collectComparisons(overview);

  let bestPreferred: JplagSimilarityResult | null = null;
  let bestAny: JplagSimilarityResult | null = null;

  for (const row of lists) {
    const rec = asRecord(row);
    if (!rec) continue;
    const first =
      nameOf(rec.first_submission) ??
      nameOf(rec.firstSubmission) ??
      nameOf(rec.submission1) ??
      null;
    const second =
      nameOf(rec.second_submission) ??
      nameOf(rec.secondSubmission) ??
      nameOf(rec.submission2) ??
      null;
    const sim =
      pickSimilarity(rec.similarities) ??
      (Number.isFinite(Number(rec.similarity)) ? Number(rec.similarity) : null);
    if (sim === null) continue;

    const hit: JplagSimilarityResult = {
      similarity: sim,
      firstSubmission: first,
      secondSubmission: second,
    };
    if (!bestAny || hit.similarity > bestAny.similarity) bestAny = hit;

    const names = new Set([first, second].filter(Boolean));
    if (names.has(preferredNames.a) && names.has(preferredNames.b)) {
      if (!bestPreferred || hit.similarity > bestPreferred.similarity) {
        bestPreferred = hit;
      }
    }
  }

  return bestPreferred ?? bestAny ?? { similarity: 0, firstSubmission: null, secondSubmission: null };
}
