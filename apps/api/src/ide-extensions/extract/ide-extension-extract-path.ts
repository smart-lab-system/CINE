import { EXTRACT_PATH_SEGMENT_REGEX } from '../../storage/storage.types';

export class UnsafeExtractPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeExtractPathError';
  }
}

/**
 * Normalize a ZIP entry name to a relative POSIX path under the extract
 * prefix. Rejects Zip Slip / absolute / null-byte paths (spec §2 #10).
 */
export function sanitizeExtractRelativePath(entryName: string): string {
  if (!entryName || entryName.includes('\0')) {
    throw new UnsafeExtractPathError(`Đường dẫn entry không hợp lệ: ${JSON.stringify(entryName)}`);
  }

  let path = entryName.replace(/\\/g, '/');
  // ZIP directory markers end with `/` — strip for file keys / tree names.
  const isDir = path.endsWith('/');
  if (isDir) {
    path = path.replace(/\/+$/, '');
  }

  if (!path) {
    throw new UnsafeExtractPathError('Entry thư mục rỗng.');
  }

  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new UnsafeExtractPathError(`Đường dẫn tuyệt đối bị từ chối: ${JSON.stringify(entryName)}`);
  }

  const parts = path.split('/');
  const safe: string[] = [];
  for (const segment of parts) {
    if (!segment || segment === '.') continue;
    if (segment === '..' || !EXTRACT_PATH_SEGMENT_REGEX.test(segment)) {
      throw new UnsafeExtractPathError(
        `Zip Slip / segment không an toàn: ${JSON.stringify(entryName)}`,
      );
    }
    safe.push(segment);
  }

  if (safe.length === 0) {
    throw new UnsafeExtractPathError(`Đường dẫn rỗng sau chuẩn hóa: ${JSON.stringify(entryName)}`);
  }

  return safe.join('/');
}

export function guessExtractContentType(relativePath: string): string {
  const lower = relativePath.toLowerCase();
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.xml') || lower.endsWith('.vsixmanifest')) return 'application/xml';
  if (lower.endsWith('.js') || lower.endsWith('.cjs') || lower.endsWith('.mjs')) {
    return 'text/javascript';
  }
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'text/typescript';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  if (lower.endsWith('.md') || lower.endsWith('.txt') || lower.endsWith('.map')) {
    return 'text/plain';
  }
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  if (lower.endsWith('.woff')) return 'font/woff';
  return 'application/octet-stream';
}
