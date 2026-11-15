import JSZip from 'jszip';
import { similarityFromOverviewJson } from './jplag-report';

export type JplagPos = { line: number; column: number };

export type JplagParsedMatch = {
  firstPath: string;
  secondPath: string;
  startInFirst: JplagPos;
  endInFirst: JplagPos;
  startInSecond: JplagPos;
  endInSecond: JplagPos;
  lengthOfFirst: number;
  lengthOfSecond: number;
};

export type JplagParsedFile = {
  id: string;
  path: string;
  content: string;
};

export type JplagParsedComparison = {
  files: JplagParsedFile[];
  matches: JplagParsedMatch[];
  firstSubmission: string | null;
  secondSubmission: string | null;
  similarity: number;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Normalize Windows/zip paths to POSIX. */
export function normalizeJplagPath(p: string): string {
  return p.replace(/\\/g, '/');
}

function readPos(raw: unknown): JplagPos {
  const rec = asRecord(raw);
  return {
    line: Number(rec?.line) || 1,
    column: Number(rec?.column) || 0,
  };
}

function parseMatches(raw: unknown): JplagParsedMatch[] {
  if (!Array.isArray(raw)) return [];
  const out: JplagParsedMatch[] = [];
  for (const row of raw) {
    const rec = asRecord(row);
    if (!rec) continue;
    const firstPath = normalizeJplagPath(String(rec.firstFileName ?? ''));
    const secondPath = normalizeJplagPath(String(rec.secondFileName ?? ''));
    if (!firstPath || !secondPath) continue;
    out.push({
      firstPath,
      secondPath,
      startInFirst: readPos(rec.startInFirst),
      endInFirst: readPos(rec.endInFirst),
      startInSecond: readPos(rec.startInSecond),
      endInSecond: readPos(rec.endInSecond),
      lengthOfFirst: Number(rec.lengthOfFirst) || 0,
      lengthOfSecond: Number(rec.lengthOfSecond) || 0,
    });
  }
  return out;
}

async function loadComparisonJson(
  zip: JSZip,
  first: string | null,
  second: string | null,
): Promise<unknown | null> {
  if (first && second) {
    const candidates = [
      `comparisons/${first}-${second}.json`,
      `comparisons/${second}-${first}.json`,
    ];
    for (const name of candidates) {
      const file = zip.file(name);
      if (file) return JSON.parse(await file.async('string')) as unknown;
    }
  }
  const names = Object.keys(zip.files).filter(
    (n) => n.startsWith('comparisons/') && n.endsWith('.json') && !zip.files[n]?.dir,
  );
  if (names.length === 0) return null;
  const file = zip.file(names[0]!);
  if (!file) return null;
  return JSON.parse(await file.async('string')) as unknown;
}

async function loadFiles(zip: JSZip): Promise<JplagParsedFile[]> {
  const files: JplagParsedFile[] = [];
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;
    if (!name.startsWith('files/')) continue;
    const rel = normalizeJplagPath(name.slice('files/'.length));
    if (!rel) continue;
    const slash = rel.indexOf('/');
    const id = slash >= 0 ? rel.slice(0, slash) : rel;
    const pathInSub = slash >= 0 ? rel.slice(slash + 1) : rel;
    const content = await entry.async('string');
    files.push({
      id,
      path: pathInSub || rel,
      content,
    });
  }
  return files;
}

/**
 * Parse a JPlag 6.x `.jplag` (zip) buffer into FE-friendly comparison data.
 */
export async function parseJplagReportBuffer(buf: Buffer): Promise<JplagParsedComparison> {
  const zip = await JSZip.loadAsync(buf);

  // Reject truncated JSON early.
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name];
    if (!entry || entry.dir || !name.endsWith('.json')) continue;
    const text = await entry.async('string');
    try {
      JSON.parse(text);
    } catch {
      throw new Error(`Report JPlag hỏng (JSON cắt cụt ở ${name}).`);
    }
  }

  let overview: unknown = null;
  for (const name of ['topComparisons.json', 'overview.json']) {
    const file = zip.file(name);
    if (file) {
      overview = JSON.parse(await file.async('string')) as unknown;
      break;
    }
  }
  const sim = similarityFromOverviewJson(overview ?? []);

  const comparisonRaw = await loadComparisonJson(
    zip,
    sim.firstSubmission,
    sim.secondSubmission,
  );
  const comparisonRec = asRecord(comparisonRaw);
  const matches = parseMatches(comparisonRec?.matches);
  const files = await loadFiles(zip);

  let similarity = sim.similarity;
  if (comparisonRec) {
    const fromComp =
      Number(asRecord(comparisonRec.similarities)?.AVG) ||
      Number(comparisonRec.firstSimilarity) ||
      null;
    if (fromComp != null && Number.isFinite(fromComp)) similarity = fromComp;
  }

  return {
    files,
    matches,
    firstSubmission: sim.firstSubmission,
    secondSubmission: sim.secondSubmission,
    similarity,
  };
}
