/**
 * Trích văn bản bài `code_project` cho đường one_shot (đọc mã, không chạy).
 *
 * File lẻ: ủy quyền `extractText`. ZIP: giải nén an toàn, lấy entry mã nguồn
 * text (gồm `.java`), ghép có header đường dẫn. RAR / không có nguồn → `''`.
 */

import yauzl from 'yauzl';
import { detectArchiveFormat } from '../../submission/archive-check/archive-reader';
import { extractText } from '../extract-text';
import { MAX_GRADING_INPUT_CHARS, TRUNCATION_NOTICE } from '../grading.types';

/** Đuôi mã nguồn one-shot (Java DSA + các ngôn ngữ khai trên deliverable). */
export const CODE_PROJECT_SOURCE_EXTENSIONS = new Set([
  '.java',
  '.py',
  '.js',
  '.ts',
  '.tsx',
  '.jsx',
  '.c',
  '.h',
  '.cpp',
  '.cc',
  '.cxx',
  '.hpp',
  '.cs',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.kt',
  '.scala',
]);

const ZIP_MAX_FILES = 200;
const ZIP_MAX_TOTAL_BYTES = 8 * 1024 * 1024;
const ZIP_ENTRY_MAX_BYTES = 1024 * 1024;

function extensionOf(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot).toLowerCase();
}

function isWantedSourcePath(raw: string): boolean {
  const normalised = raw.replace(/\\/g, '/');
  const segments = normalised.split('/').filter((s) => s.length > 0);
  if (segments[0] === '__MACOSX' || segments.some((s) => s.startsWith('.'))) return false;
  return CODE_PROJECT_SOURCE_EXTENSIONS.has(extensionOf(normalised));
}

/** Chuẩn hoá đường dẫn entry; null nếu zip-slip / thư mục / rỗng. */
export function sanitizeCodeZipPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.endsWith('/')) return null;
  const parts = normalized.split('/');
  if (parts.some((p) => p === '..' || p === '' || p === '.')) return null;
  return parts.join('/');
}

function capChars(text: string): string {
  if (text.length <= MAX_GRADING_INPUT_CHARS) return text;
  return text.slice(0, MAX_GRADING_INPUT_CHARS - TRUNCATION_NOTICE.length) + TRUNCATION_NOTICE;
}

function decodeUtf8(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null;
  return bytes.toString('utf8').replace(/^\uFEFF/, '');
}

function joinSources(files: { path: string; content: string }[]): string {
  if (files.length === 0) return '';
  // Luôn gắn đường dẫn (kể cả 1 file) — AI/hồ sơ biết tên trong zip.
  return files.map((f) => `// --- ${f.path} ---\n${f.content}`).join('\n\n');
}

/**
 * Byte bài nộp + tên đã khai → văn bản để chấm / hiện hồ sơ.
 * Không ném vì định dạng: thất bại → `''` (trừ khi caller đã chặn trần byte).
 */
export async function resolveCodeProjectText(
  bytes: Buffer,
  declaredFilename: string,
): Promise<string> {
  const format = detectArchiveFormat(bytes);
  if (format === 'rar') return '';
  if (format === 'zip') {
    try {
      const files = await readSourceEntriesFromZip(bytes);
      return capChars(joinSources(files));
    } catch {
      return '';
    }
  }
  return extractText(bytes, declaredFilename);
}

async function readSourceEntriesFromZip(
  buffer: Buffer,
): Promise<{ path: string; content: string }[]> {
  const entries = await readZipRaw(buffer);
  const out: { path: string; content: string }[] = [];
  for (const entry of entries) {
    if (!isWantedSourcePath(entry.path)) continue;
    const content = decodeUtf8(entry.bytes);
    if (content === null) continue;
    out.push({ path: entry.path, content });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

function readZipRaw(buffer: Buffer): Promise<Array<{ path: string; bytes: Buffer }>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(openError ?? new Error('không mở được zip'));
        return;
      }

      const results: Array<{ path: string; bytes: Buffer }> = [];
      let totalUncompressed = 0;

      const fail = (error: unknown) => {
        zipfile.close();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      zipfile.on('error', fail);
      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const rel = sanitizeCodeZipPath(entry.fileName);
        if (!rel || entry.fileName.endsWith('/')) {
          zipfile.readEntry();
          return;
        }
        if (!isWantedSourcePath(rel)) {
          zipfile.readEntry();
          return;
        }
        if (results.length >= ZIP_MAX_FILES) {
          fail(new Error(`zip bài code có quá ${ZIP_MAX_FILES} file nguồn`));
          return;
        }
        if (entry.uncompressedSize > ZIP_ENTRY_MAX_BYTES) {
          zipfile.readEntry();
          return;
        }
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > ZIP_MAX_TOTAL_BYTES) {
          fail(new Error('zip bài code bung ra quá lớn'));
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(streamError ?? new Error('không đọc được entry'));
            return;
          }
          const chunks: Buffer[] = [];
          let total = 0;
          stream.on('data', (chunk: Buffer) => {
            total += chunk.length;
            if (total > ZIP_ENTRY_MAX_BYTES) {
              stream.destroy();
              fail(new Error(`entry "${rel}" vượt ${ZIP_ENTRY_MAX_BYTES} byte`));
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', fail);
          stream.on('end', () => {
            results.push({ path: rel, bytes: Buffer.concat(chunks) });
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => {
        zipfile.close();
        resolve(results);
      });
    });
  });
}
