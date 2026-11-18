/**
 * Tự quét file entry (điểm vào `main`) cho playground console.
 * Regex / heuristic — không AST. Khi mơ hồ trả candidates để UI chọn.
 */

export type ConsoleLanguage = 'c' | 'cpp' | 'java' | 'python';
export type PlaygroundLanguage =
  | ConsoleLanguage
  | 'static'
  | 'spring-boot'
  | 'vite-react'
  | 'express';

export interface SourceFile {
  /** Đường dẫn relative dùng `/`, không `..`. */
  path: string;
  content: string;
}

export type EntryDetection = 'single' | 'auto' | 'pending';

export interface EntryScanResult {
  detection: EntryDetection;
  entryPath: string | null;
  candidates: string[];
}

const SKIP_PATH_RE = /(^|\/)(node_modules|__pycache__|\.git|test|tests)(\/|$)/i;

const EXT: Record<ConsoleLanguage, string[]> = {
  c: ['.c'],
  cpp: ['.cpp', '.cc', '.cxx'],
  java: ['.java'],
  python: ['.py'],
};

const CONVENTION: Record<ConsoleLanguage, string[]> = {
  c: ['main.c'],
  cpp: ['main.cpp'],
  java: ['Main.java'],
  python: ['main.py'],
};

const MAIN_BODY: Record<ConsoleLanguage, RegExp> = {
  c: /\b(int|void)\s+main\s*\(/,
  cpp: /\b(int|void)\s+main\s*\(/,
  java: /public\s+static\s+void\s+main\s*\(/,
  python: /if\s+__name__\s*==\s*['"]__main__['"]/,
};

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

function depth(p: string): number {
  if (!p) return 0;
  return p.split('/').filter(Boolean).length - 1;
}

function hasExt(path: string, language: ConsoleLanguage): boolean {
  const lower = path.toLowerCase();
  return EXT[language].some((e) => lower.endsWith(e));
}

function scoreCandidate(
  file: SourceFile,
  language: ConsoleLanguage,
  hasMainBody: boolean,
): number {
  const base = basename(file.path);
  let score = 0;
  if (CONVENTION[language].includes(base)) score += 100;
  score += Math.max(0, 20 - depth(file.path) * 5);
  if (hasMainBody) score += 40;
  if (/main/i.test(base)) score += 15;
  if (SKIP_PATH_RE.test(file.path)) score -= 50;
  return score;
}

/**
 * Quét danh sách file đã unpack. `files` chỉ chứa text (binary bỏ trước).
 */
export function scanEntry(
  language: ConsoleLanguage,
  files: SourceFile[],
): EntryScanResult {
  const relevant = files.filter(
    (f) => hasExt(f.path, language) && !SKIP_PATH_RE.test(f.path),
  );

  if (relevant.length === 0) {
    return { detection: 'pending', entryPath: null, candidates: [] };
  }

  if (relevant.length === 1) {
    return {
      detection: 'single',
      entryPath: relevant[0]!.path,
      candidates: [relevant[0]!.path],
    };
  }

  const scored = relevant.map((f) => {
    const hasMain = MAIN_BODY[language].test(f.content);
    return { path: f.path, score: scoreCandidate(f, language, hasMain), hasMain };
  });

  // Ứng viên: có tên quy ước hoặc có signature main
  let candidates = scored.filter(
    (s) =>
      s.hasMain ||
      CONVENTION[language].includes(basename(s.path)) ||
      /main/i.test(basename(s.path)),
  );

  if (candidates.length === 0) {
    // Không ai rõ — lấy toàn bộ file đúng đuôi làm candidates
    candidates = scored;
  }

  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  if (candidates.length === 1) {
    return {
      detection: 'auto',
      entryPath: candidates[0]!.path,
      candidates: candidates.map((c) => c.path),
    };
  }

  const top = candidates[0]!;
  const second = candidates[1]!;
  // Khoảng cách rõ: nhất hơn nhì ít nhất 20 điểm
  if (top.score - second.score >= 20) {
    return {
      detection: 'auto',
      entryPath: top.path,
      candidates: candidates.map((c) => c.path),
    };
  }

  return {
    detection: 'pending',
    entryPath: null,
    candidates: candidates.map((c) => c.path),
  };
}

/** Đọc `package x.y;` đầu file Java (nếu có). */
export function javaPackage(content: string): string | null {
  const m = content.match(/^\s*package\s+([\w.]+)\s*;/m);
  return m?.[1] ?? null;
}

/** Class chạy từ path entry + package (MVP: tên file không `.java`). */
export function javaMainClass(entryPath: string, content: string): string {
  const name = basename(entryPath).replace(/\.java$/i, '');
  const pkg = javaPackage(content);
  return pkg ? `${pkg}.${name}` : name;
}
