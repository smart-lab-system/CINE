import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  maxApproachPoints,
  parseDsaRubricText,
  type ParsedDsaApproach,
} from './parse-dsa-rubric';

export interface DsaProblemImport {
  number: number;
  name: string;
  folder: string;
  statement: string;
  approaches: ParsedDsaApproach[];
  /** Điểm câu = max tổng mark các hướng. */
  points: number;
  rubricName: string;
}

export function defaultDsaDatasetRoot(): string {
  // apps/api/src/exam-bank/dsa-import → repo root / dsa_vi_03
  return join(__dirname, '../../../../../dsa_vi_03');
}

function parseIndexCsv(raw: string): { number: number; name: string; folder: string }[] {
  const lines = raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out: { number: number; name: string; folder: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === 0 && /^number,/i.test(lines[i])) continue;
    const parts = lines[i].split(',');
    if (parts.length < 3) continue;
    const number = Number(parts[0]);
    const folder = parts[parts.length - 1].trim();
    const name = parts.slice(1, -1).join(',').trim();
    if (!Number.isFinite(number) || !folder) continue;
    out.push({ number, name, folder });
  }
  return out;
}

/**
 * Đọc toàn bộ (hoặc `limit`) bài từ dsa_vi_03 — chỉ question.txt + rubric.txt.
 */
export function loadDsaDataset(
  rootDir: string = defaultDsaDatasetRoot(),
  opts?: { limit?: number },
): DsaProblemImport[] {
  const indexPath = join(rootDir, 'index.csv');
  if (!existsSync(indexPath)) {
    throw new Error(`Không thấy ${indexPath}`);
  }
  let rows = parseIndexCsv(readFileSync(indexPath, 'utf8'));
  if (opts?.limit != null && opts.limit > 0) {
    rows = rows.slice(0, opts.limit);
  }

  const problems: DsaProblemImport[] = [];
  for (const row of rows) {
    const dir = join(rootDir, row.folder);
    const qPath = join(dir, 'question.txt');
    const rPath = join(dir, 'rubric.txt');
    if (!existsSync(qPath) || !existsSync(rPath)) {
      throw new Error(`Thiếu question.txt hoặc rubric.txt trong ${row.folder}`);
    }
    const statement = readFileSync(qPath, 'utf8').replace(/\r\n/g, '\n').trim();
    if (!statement) throw new Error(`${row.folder}: question.txt trống`);
    const rubric = parseDsaRubricText(readFileSync(rPath, 'utf8'));
    const points = maxApproachPoints(rubric.approaches);
    problems.push({
      number: row.number,
      name: row.name,
      folder: row.folder,
      statement,
      approaches: rubric.approaches,
      points,
      rubricName: `dsa:${row.folder}`,
    });
  }
  return problems;
}
