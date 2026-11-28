/**
 * Map mã học phần → stack playground, và suy luận ngôn ngữ từ
 * deliverable / cây file bài nộp khi không thuộc 4 môn web cố định.
 */

import type { PlaygroundLanguage } from './entry-scanner';

/** Môn có stack chạy thử cố định (không phụ thuộc cây file). */
export const COURSE_PLAYGROUND_LANGUAGE: Readonly<Record<string, PlaygroundLanguage>> = {
  '4220002399': 'static', // Hệ Thống và Công nghệ Web
  '4220015436': 'vite-react', // Phát triển giao diện ứng dụng
  '4220003262': 'express', // Công nghệ mới trong phát triển ứng dụng CNTT
  '4220003950': 'spring-boot', // Lập trình WWW (Java)
};

const CONSOLE_FROM_DELIVERABLE: Readonly<Record<string, PlaygroundLanguage>> = {
  python: 'python',
  cpp: 'cpp',
  java: 'java',
  c: 'c',
};

function basename(p: string): string {
  const n = p.replace(/\\/g, '/');
  const i = n.lastIndexOf('/');
  return i < 0 ? n : n.slice(i + 1);
}

function hasFile(paths: string[], name: string): boolean {
  const lower = name.toLowerCase();
  return paths.some((p) => basename(p).toLowerCase() === lower);
}

function hasPathEnding(paths: string[], suffix: string): boolean {
  const lower = suffix.toLowerCase();
  return paths.some((p) => p.replace(/\\/g, '/').toLowerCase().endsWith(lower));
}

function countExt(paths: string[], exts: string[]): number {
  const set = new Set(exts.map((e) => e.toLowerCase()));
  let n = 0;
  for (const p of paths) {
    const base = basename(p).toLowerCase();
    const i = base.lastIndexOf('.');
    if (i >= 0 && set.has(base.slice(i))) n += 1;
  }
  return n;
}

/** Chuẩn hoá tên entry zip (bỏ folder, giữ path `/`). */
export function normalizeListedPaths(rawNames: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawNames) {
    const n = raw.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!n || /\/$/.test(n)) continue;
    if (n.split('/').some((seg) => seg === '..' || seg === '')) continue;
    out.push(n);
  }
  return out;
}

/**
 * Suy stack từ cây file (sau khi đã biết không thuộc map môn / deliverable console).
 * Trả `null` khi mơ hồ.
 */
export function detectPlaygroundLanguageFromPaths(
  filePaths: string[],
): PlaygroundLanguage | null {
  const paths = normalizeListedPaths(filePaths);
  if (paths.length === 0) return null;

  if (hasFile(paths, 'pom.xml') || hasPathEnding(paths, '/pom.xml')) {
    return 'spring-boot';
  }

  const hasPkg = hasFile(paths, 'package.json');
  const hasViteConfig = paths.some((p) => /^vite\.config\./i.test(basename(p)));
  const hasExpressEntry =
    hasFile(paths, 'app.js') || hasFile(paths, 'server.js') || hasFile(paths, 'index.js');

  if (hasPkg && hasViteConfig) return 'vite-react';
  if (hasPkg && hasExpressEntry && !hasViteConfig) return 'express';
  if (hasPkg && hasFile(paths, 'index.html')) return 'vite-react';

  if (
    hasFile(paths, 'index.html') ||
    hasPathEnding(paths, '/html/index.html') ||
    paths.some((p) => p.replace(/\\/g, '/').toLowerCase().startsWith('html/'))
  ) {
    return 'static';
  }

  const counts: { lang: PlaygroundLanguage; n: number }[] = [
    { lang: 'python', n: countExt(paths, ['.py']) },
    { lang: 'java', n: countExt(paths, ['.java']) },
    { lang: 'cpp', n: countExt(paths, ['.cpp', '.cc', '.cxx']) },
    { lang: 'c', n: countExt(paths, ['.c']) },
  ];
  const ranked = counts.filter((c) => c.n > 0).sort((a, b) => b.n - a.n);
  if (ranked.length === 0) return null;
  if (ranked.length === 1) return ranked[0]!.lang;
  if (ranked[0]!.n > ranked[1]!.n) return ranked[0]!.lang;
  return null;
}

export function resolvePlaygroundLanguage(input: {
  courseCode: string | null | undefined;
  deliverableLanguage: string | null | undefined;
  filePaths: string[];
}): PlaygroundLanguage {
  const code = input.courseCode?.trim();
  if (code && COURSE_PLAYGROUND_LANGUAGE[code]) {
    return COURSE_PLAYGROUND_LANGUAGE[code]!;
  }

  const declared = input.deliverableLanguage?.trim().toLowerCase() ?? '';
  if (declared && CONSOLE_FROM_DELIVERABLE[declared]) {
    return CONSOLE_FROM_DELIVERABLE[declared]!;
  }

  const detected = detectPlaygroundLanguageFromPaths(input.filePaths);
  if (detected) return detected;

  throw new Error(
    'Không xác định được ngôn ngữ chạy thử - kiểm tra mã môn, ngôn ngữ deliverable, hoặc cấu trúc bài nộp.',
  );
}

/** Flags extractZip theo stack đã chọn. */
export function zipExtractModes(language: PlaygroundLanguage): {
  staticMode: boolean;
  springMode: boolean;
  viteMode: boolean;
  expressMode: boolean;
} {
  return {
    staticMode: language === 'static',
    springMode: language === 'spring-boot',
    viteMode: language === 'vite-react',
    expressMode: language === 'express',
  };
}
