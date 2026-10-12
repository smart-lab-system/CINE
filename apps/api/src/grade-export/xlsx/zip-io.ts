import JSZip from 'jszip';
import * as yauzl from 'yauzl';

/**
 * Đọc và ghi zip cho `.xlsx` — MỘT chỗ duy nhất import `yauzl` và `jszip` (plan G5, Global Constraints).
 *
 * ĐỌC bằng `yauzl`: mục lục trước (số entry, kích thước khai) rồi mới tới từng luồng, mà luồng của nó tự kiểm số
 * byte thật so với số đã khai. `jszip.loadAsync` tin mục lục và phồng bộ nhớ trước khi có chỗ nào để đếm —
 * chính lý do `archive-reader.ts` cũng dùng `yauzl`. GHI bằng `jszip`, và chỉ từ buffer đã qua cửa kiểm này.
 */
export interface ZipEntry {
  name: string;
  data: Buffer;
  /** Giờ DOS của entry, đọc theo UTC để ghi lại đúng từng trường. */
  date: Date;
  isDirectory: boolean;
}

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ZipLimits = {
  maxEntries: 500,
  maxEntryBytes: 20 * 1024 * 1024,
  maxTotalBytes: 60 * 1024 * 1024,
};

export class NotZipError extends Error {}
/** Container CFB (`D0 CF 11 E0`): `.xls` cũ, hoặc `.xlsx` có mật khẩu (Excel bọc nó vào CFB). */
export class EncryptedOrLegacyError extends Error {}
export class ZipLimitError extends Error {}
export class CorruptZipError extends Error {}

const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);
const ZIP_MAGICS = [Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from([0x50, 0x4b, 0x05, 0x06])];

const startsWith = (buffer: Buffer, magic: Buffer) =>
  buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);

function assertLooksLikeZip(buffer: Buffer): void {
  if (startsWith(buffer, CFB_MAGIC)) throw new EncryptedOrLegacyError('container CFB');
  if (!ZIP_MAGICS.some((magic) => startsWith(buffer, magic))) throw new NotZipError('không có chữ ký zip');
}

export function readZipEntries(buffer: Buffer, limits: ZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipEntry[]> {
  return new Promise((resolve, reject) => {
    try {
      assertLooksLikeZip(buffer);
    } catch (error) {
      reject(error);
      return;
    }
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(new CorruptZipError(openError?.message ?? 'không mở được'));
        return;
      }
      if (zipfile.entryCount > limits.maxEntries) {
        zipfile.close();
        reject(new ZipLimitError(`${zipfile.entryCount} entry, tối đa ${limits.maxEntries}`));
        return;
      }

      const out: ZipEntry[] = [];
      let total = 0;
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        zipfile.close();
        reject(error);
      };

      zipfile.on('error', (error: Error) => fail(new CorruptZipError(error.message)));
      zipfile.on('end', () => {
        if (settled) return;
        settled = true;
        resolve(out);
      });
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const date = entry.getLastModDate({ timezone: 'UTC' });
        if (entry.fileName.endsWith('/')) {
          out.push({ name: entry.fileName, data: Buffer.alloc(0), date, isDirectory: true });
          zipfile.readEntry();
          return;
        }
        if (entry.isEncrypted()) {
          fail(new EncryptedOrLegacyError(`entry mã hoá: ${entry.fileName}`));
          return;
        }
        if (entry.uncompressedSize > limits.maxEntryBytes) {
          fail(new ZipLimitError(`${entry.fileName}: ${entry.uncompressedSize} byte, tối đa ${limits.maxEntryBytes}`));
          return;
        }
        total += entry.uncompressedSize;
        if (total > limits.maxTotalBytes) {
          fail(new ZipLimitError(`tổng kích thước giải nén khai vượt ${limits.maxTotalBytes}`));
          return;
        }
        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            fail(new CorruptZipError(streamError?.message ?? `không đọc được ${entry.fileName}`));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', (error: Error) => fail(new CorruptZipError(error.message)));
          stream.on('end', () => {
            out.push({ name: entry.fileName, data: Buffer.concat(chunks), date, isDirectory: false });
            zipfile.readEntry();
          });
        });
      });
      zipfile.readEntry();
    });
  });
}

/**
 * `createFolders: false` là bắt buộc: mặc định của JSZip thêm entry thư mục mà file gốc không có, và bất biến của
 * G5 là *"mọi phần khác của file giống hệt"*.
 */
export async function writeZip(entries: ZipEntry[]): Promise<Buffer> {
  const zip = new JSZip();
  for (const entry of entries) {
    if (entry.isDirectory) zip.file(entry.name, null, { dir: true, date: entry.date, createFolders: false });
    else zip.file(entry.name, entry.data, { date: entry.date, createFolders: false, binary: true });
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}
