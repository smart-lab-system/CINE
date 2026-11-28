/**
 * Slug công khai cho preview: `{mssv}-{ten-khong-dau}` → dùng dưới `/pg/{slug}/`.
 */

export function slugifyPreviewName(name: string): string {
  const slug = name
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug === '' ? 'sv' : slug;
}

export function buildPreviewSlug(mssv: string, studentName: string | null | undefined): string {
  const id = String(mssv ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const base = id || 'sv';
  return `${base}-${slugifyPreviewName(studentName ?? '')}`.slice(0, 160);
}

/** Base URL công khai (vd. https://examcine.site) - không có slash cuối. */
export function playgroundPublicBase(): string | null {
  const raw = process.env.PLAYGROUND_PUBLIC_BASE?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

/**
 * URL mở giao diện qua reverse proxy `/pg/{slug}/`.
 * `entryPath` (static) có thể là `html/index.html` - nối sau slug.
 */
export function buildPublicPreviewUrl(slug: string, entryPath?: string | null): string | null {
  const base = playgroundPublicBase();
  if (!base || !slug) return null;
  const entry = (entryPath ?? '').replace(/^\/+/, '');
  if (!entry || entry === 'index.html') {
    return `${base}/pg/${slug}/`;
  }
  return `${base}/pg/${slug}/${entry}`;
}
