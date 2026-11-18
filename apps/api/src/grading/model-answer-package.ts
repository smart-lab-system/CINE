import yauzl from 'yauzl';
import { extractText } from './extract-text';

/** Trần số file trong zip đáp án mẫu (chấm AI, không phải sandbox). */
export const MODEL_ANSWER_ZIP_MAX_FILES = 200;
/** Tổng byte giải nén. */
export const MODEL_ANSWER_ZIP_MAX_BYTES = 40 * 1024 * 1024;
/** Một entry trong zip. */
export const MODEL_ANSWER_ZIP_ENTRY_MAX_BYTES = 5 * 1024 * 1024;

export type ModelAnswerPackageKind = 'file' | 'zip';

export type ModelAnswerFileText = { path: string; text: string };

export function packageKindFromFilename(filename: string | null | undefined): ModelAnswerPackageKind {
  const name = (filename ?? '').trim().toLowerCase();
  return name.endsWith('.zip') ? 'zip' : 'file';
}

export function isPdfFilename(filename: string | null | undefined): boolean {
  return (filename ?? '').trim().toLowerCase().endsWith('.pdf');
}

/** Chuẩn hoá đường dẫn entry; null nếu zip-slip / rỗng / thư mục. */
export function sanitizeZipEntryPath(raw: string): string | null {
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.endsWith('/')) return null;
  const parts = normalized.split('/');
  if (parts.some((p) => p === '..' || p === '')) return null;
  if (parts.some((p) => p === '.')) return null;
  return parts.join('/');
}

/**
 * Giải nén zip đáp án mẫu → text từng file (bỏ entry không trích được).
 * Ném Error khi zip hỏng, zip-slip, hoặc vượt trần.
 */
export async function extractModelAnswerZip(buffer: Buffer): Promise<ModelAnswerFileText[]> {
  const entries = await readZipEntries(buffer);
  const out: ModelAnswerFileText[] = [];
  for (const entry of entries) {
    try {
      const text = (await extractText(entry.bytes, entry.path)).trim();
      if (text.length > 0) out.push({ path: entry.path, text });
    } catch {
      /* bỏ file không trích được - vẫn dùng các file còn lại */
    }
  }
  return out;
}

function readZipEntries(
  buffer: Buffer,
): Promise<Array<{ path: string; bytes: Buffer }>> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(new Error(openError?.message ?? 'không mở được zip đáp án mẫu'));
        return;
      }

      const results: Array<{ path: string; bytes: Buffer }> = [];
      let totalUncompressed = 0;

      zipfile.readEntry();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const rel = sanitizeZipEntryPath(entry.fileName);
        if (!rel) {
          zipfile.readEntry();
          return;
        }
        if (results.length >= MODEL_ANSWER_ZIP_MAX_FILES) {
          zipfile.close();
          reject(new Error(`zip đáp án mẫu có quá ${MODEL_ANSWER_ZIP_MAX_FILES} file`));
          return;
        }
        totalUncompressed += entry.uncompressedSize;
        if (totalUncompressed > MODEL_ANSWER_ZIP_MAX_BYTES) {
          zipfile.close();
          reject(new Error('zip đáp án mẫu bung ra quá lớn'));
          return;
        }

        zipfile.openReadStream(entry, (err, stream) => {
          if (err || !stream) {
            zipfile.close();
            reject(err ?? new Error('không đọc entry zip đáp án mẫu'));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          stream.on('data', (c: Buffer) => {
            size += c.length;
            if (size > MODEL_ANSWER_ZIP_ENTRY_MAX_BYTES) {
              stream.destroy();
              zipfile.close();
              reject(new Error(`file trong zip đáp án mẫu quá lớn: ${rel}`));
              return;
            }
            chunks.push(c);
          });
          stream.on('error', (e) => {
            zipfile.close();
            reject(e);
          });
          stream.on('end', () => {
            results.push({ path: rel, bytes: Buffer.concat(chunks) });
            zipfile.readEntry();
          });
        });
      });
      zipfile.on('end', () => resolve(results));
      zipfile.on('error', reject);
    });
  });
}
