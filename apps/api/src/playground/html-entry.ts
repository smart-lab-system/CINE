/**
 * Chọn file HTML vào cho web tĩnh (index.html ưu tiên).
 */

export interface HtmlScanResult {
  detection: 'single' | 'auto' | 'pending';
  entryPath: string | null;
  candidates: string[];
}

function depth(p: string): number {
  return p.split('/').filter(Boolean).length - 1;
}

function scoreHtml(path: string): number {
  const base = path.split('/').pop() ?? path;
  let score = 0;
  if (base.toLowerCase() === 'index.html') score += 100;
  if (path.toLowerCase() === 'html/index.html') score += 40;
  if (path.toLowerCase() === 'index.html') score += 30;
  score += Math.max(0, 25 - depth(path) * 5);
  if (/index/i.test(base)) score += 10;
  return score;
}

export function scanHtmlEntry(filePaths: string[]): HtmlScanResult {
  const html = filePaths.filter((p) => p.toLowerCase().endsWith('.html') || p.toLowerCase().endsWith('.htm'));
  if (html.length === 0) {
    return { detection: 'pending', entryPath: null, candidates: [] };
  }
  if (html.length === 1) {
    return { detection: 'single', entryPath: html[0]!, candidates: html };
  }
  const ranked = [...html].sort((a, b) => scoreHtml(b) - scoreHtml(a) || a.localeCompare(b));
  const top = ranked[0]!;
  const second = ranked[1]!;
  if (scoreHtml(top) - scoreHtml(second) >= 20 || top.toLowerCase().endsWith('index.html')) {
    return { detection: 'auto', entryPath: top, candidates: ranked };
  }
  return { detection: 'pending', entryPath: null, candidates: ranked };
}
