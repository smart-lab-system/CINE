/**
 * Đọc DANH SÁCH TÊN trong một file nén — không bao giờ giải nén.
 *
 * Spec `2026-09-21-archive-content-validation-design.md` §6.1 và §6.2.
 *
 * Vì phép đối chiếu chỉ cần tên (§3.2), hệ thống không cần một byte nội dung
 * nào. Đọc bảng mục lục là đủ, và điều đó xoá thẳng rủi ro **zip bomb**: một
 * file 42KB phình thành 4.5PB vô hại nếu không ai bung nó ra. Đây là lợi ích
 * có chủ ý của việc khớp theo tên, không phải may mắn.
 */

import * as yauzl from 'yauzl';
import { ARCHIVE_MAX_ENTRIES } from './archive-check.constants';

export type ArchiveFormat = 'zip' | 'rar' | 'unknown';

/** Mở không ra: file hỏng, mã hoá header, hoặc không phải định dạng đã nhận. */
export class ArchiveUnreadableError extends Error {}

/** Khai quá nhiều mục — dừng giữa chừng, không đọc tiếp. */
export class ArchiveTooManyEntriesError extends Error {
  constructor() {
    super(`File nén khai quá ${ARCHIVE_MAX_ENTRIES} mục — dừng đọc.`);
  }
}

const ZIP_MAGICS = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]), // local file header
  Buffer.from([0x50, 0x4b, 0x05, 0x06]), // end of central directory (archive rỗng)
  Buffer.from([0x50, 0x4b, 0x07, 0x08]), // spanned
];

/** `Rar!\x1a\x07` — chung cho cả RAR4 và RAR5; byte thứ 7 mới phân biệt. */
const RAR_MAGIC = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]);

function startsWith(buffer: Buffer, magic: Buffer): boolean {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

/**
 * Nhận dạng bằng MAGIC BYTES, không bằng đuôi file.
 *
 * Sinh viên đổi tên `.rar` thành `.zip` là chuyện có thật, và đọc theo đuôi
 * sẽ báo `unreadable` cho một file hoàn toàn lành. Magic bytes trả lời đúng
 * câu hỏi thật — "đây là cái gì" — thay vì câu hỏi "nó tự xưng là cái gì".
 *
 * Total: buffer rỗng hay ngắn hơn cả magic đều ra `unknown`, không ném.
 */
export function detectArchiveFormat(buffer: Buffer): ArchiveFormat {
  if (ZIP_MAGICS.some((magic) => startsWith(buffer, magic))) {
    return 'zip';
  }
  if (startsWith(buffer, RAR_MAGIC)) {
    return 'rar';
  }
  return 'unknown';
}

export async function listArchiveEntries(
  buffer: Buffer,
  format: 'zip' | 'rar',
): Promise<string[]> {
  return format === 'zip' ? listZipEntries(buffer) : listRarEntries(buffer);
}

/**
 * `lazyEntries: true` là toàn bộ lý do dùng `yauzl` thay vì `jszip` (vốn đã
 * có sẵn ở `apps/agent`): nó chỉ đọc mục tiếp theo khi được gọi
 * `readEntry()`, nên trần dừng được giữa chừng. `jszip.loadAsync` dựng xong
 * cả bảng `files` rồi mới trả về — bộ nhớ đã phình trước khi có chỗ nào để
 * đếm, và cái trần trở thành trang trí.
 */
function listZipEntries(buffer: Buffer): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(new ArchiveUnreadableError(describe(openError)));
        return;
      }

      const names: string[] = [];
      let settled = false;
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };

      zipfile.on('entry', (entry: yauzl.Entry) => {
        names.push(entry.fileName);
        if (names.length > ARCHIVE_MAX_ENTRIES) {
          zipfile.close();
          settle(() => reject(new ArchiveTooManyEntriesError()));
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => settle(() => resolve(names)));
      zipfile.on('error', (error: Error) =>
        settle(() => reject(new ArchiveUnreadableError(describe(error)))),
      );

      zipfile.readEntry();
    });
  });
}

/**
 * NẠP LƯỜI — spec §12.1. `import()` động chứ không `import` ở đầu file, nên
 * một phiên chỉ dùng `.zip` không bao giờ kéo ~1MB WASM vào tiến trình.
 *
 * Kiểm chứng trên `node-unrar-js@2.0.2` với file thật do WinRAR 7.23 tạo:
 * `getFileList()` là ĐỒNG BỘ và trả `{ arcHeader, fileHeaders: Generator }`,
 * nên trần bên dưới dừng được giữa chừng y như đường zip. Mục thư mục có
 * `flags.directory === true` nhưng tên **không** kèm dấu `/`, khác với zip —
 * nên phải tự thêm để `matchEntries` nhận ra và bỏ qua nó.
 */
async function listRarEntries(buffer: Buffer): Promise<string[]> {
  try {
    const { createExtractorFromData } = await import('node-unrar-js');
    const extractor = await createExtractorFromData({
      data: Uint8Array.from(buffer).buffer as ArrayBuffer,
    });
    const list = extractor.getFileList();

    const names: string[] = [];
    for (const header of list.fileHeaders) {
      names.push(header.flags.directory ? `${header.name}/` : header.name);
      if (names.length > ARCHIVE_MAX_ENTRIES) {
        throw new ArchiveTooManyEntriesError();
      }
    }
    return names;
  } catch (error) {
    if (error instanceof ArchiveTooManyEntriesError) {
      throw error;
    }
    // Gồm cả rar mã hoá HEADER (`ERAR_MISSING_PASSWORD`, đã đo): không đọc
    // nổi danh sách thì đúng là `unreadable`, không phải `failed`. Hai kết
    // luận đó dẫn tới hai hành động khác nhau của giảng viên.
    throw new ArchiveUnreadableError(describe(error));
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return error === undefined || error === null ? 'lỗi không rõ' : String(error);
}
