/**
 * Fetching the exam materials, and writing the instructions sheet.
 *
 * Both replace something a teacher used to do by hand — emailing a question
 * paper round, or reading the required filenames out loud — with something
 * derived from data the server already holds. Neither asks the student for
 * anything, which is the constraint the agent lives under.
 *
 * The materials arrive as presigned URLs and are fetched straight from
 * object storage; the API only ever says which files exist and when they
 * open (CLAUDE.md Security rules 2 and 5).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Socket } from 'socket.io-client';

/** Where materials land, inside the student's own workspace. */
export const MATERIALS_DIRNAME = 'de-thi';
export const INSTRUCTIONS_FILENAME = 'INSTRUCTIONS.txt';

const ACK_TIMEOUT_MS = 20_000;

export interface ExamMaterial {
  id: string;
  fileName: string;
  fileSize: number;
  downloadUrl?: string;
}

type MaterialsAck =
  | { ok: true; materials: ExamMaterial[] }
  | { ok: false; code: 'NOT_JOINED' | 'STORAGE_UNAVAILABLE'; message: string }
  | { ok: false; code: 'NOT_YET_RELEASED'; message: string; releaseAt: string };

/**
 * Keeps a downloaded material from escaping the materials folder.
 *
 * The name is chosen by a teacher and travels through the server, so it is
 * input. `path.basename` collapses any directory part; the containment
 * check afterwards catches what basename alone would not on the odd
 * platform.
 */
export function resolveMaterialPath(materialsDir: string, fileName: string): string | null {
  const base = path.basename(fileName).trim();
  if (!base || base === '.' || base === '..') {
    return null;
  }
  const root = path.resolve(materialsDir);
  const resolved = path.resolve(root, base);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

export interface MaterialsOutcome {
  status: 'downloaded' | 'not-yet' | 'none' | 'failed';
  /** Newly fetched this time. Zero on a rejoin, where they are already here. */
  downloaded: number;
  /**
   * Every material the session has, fetched now or already on disk. The
   * instructions sheet lists these, and a rejoin must not produce a sheet
   * that claims the session has no paper.
   */
  fileNames: string[];
  /** Present when the server said the paper is not open yet. */
  releaseAt?: string;
}

/**
 * Asks for the materials and writes them into `<workspace>/de-thi/`.
 *
 * A file already on disk is left alone rather than re-fetched: on a
 * reconnect the paper has not changed, and re-downloading it would
 * overwrite anything the student edited in a starter file.
 */
export async function downloadMaterials(
  socket: Socket,
  workspaceDir: string,
): Promise<MaterialsOutcome> {
  const ack = await new Promise<MaterialsAck>((resolve) => {
    let settled = false;
    const done = (value: MaterialsAck) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    socket.emit('agent:request-materials', {}, done);
    setTimeout(
      () => done({ ok: false, code: 'STORAGE_UNAVAILABLE', message: 'timed out' }),
      ACK_TIMEOUT_MS,
    );
  });

  if (!ack.ok) {
    return ack.code === 'NOT_YET_RELEASED'
      ? { status: 'not-yet', downloaded: 0, fileNames: [], releaseAt: ack.releaseAt }
      : { status: 'failed', downloaded: 0, fileNames: [] };
  }
  if (ack.materials.length === 0) {
    return { status: 'none', downloaded: 0, fileNames: [] };
  }

  const materialsDir = path.join(workspaceDir, MATERIALS_DIRNAME);
  await fs.promises.mkdir(materialsDir, { recursive: true });

  let downloaded = 0;
  const fileNames: string[] = [];
  for (const material of ack.materials) {
    if (!material.downloadUrl) {
      continue;
    }
    const target = resolveMaterialPath(materialsDir, material.fileName);
    if (!target) {
      console.warn(
        `[CẢNH BÁO BẢO MẬT] Bỏ qua đề thi có tên file không an toàn: ${material.fileName}`,
      );
      continue;
    }
    if (fs.existsSync(target)) {
      // Already here from an earlier join. The paper has not changed, and
      // a starter file the student has been editing must not be reset.
      fileNames.push(path.basename(target));
      continue;
    }

    try {
      const response = await fetch(material.downloadUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      await fs.promises.writeFile(
        target,
        new Uint8Array(await response.arrayBuffer()),
        { flag: 'wx' },
      );
      downloaded++;
      fileNames.push(path.basename(target));
    } catch (error) {
      console.warn(
        `[CẢNH BÁO] Không tải được "${material.fileName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { status: 'downloaded', downloaded, fileNames };
}

export interface InstructionsInput {
  sessionName: string;
  studentName: string | null;
  studentId: string;
  endTime: string;
  /**
   * Thay `requiredFiles: string[]` cũ — giữ cả hai là đúng kiểu "hai sự
   * thật có thể lệch nhau" mà chính module này đang cố tránh (xem
   * `RequiredDeliverableEntryEntity`/`filename-template.ts` phía backend,
   * cùng lý lẽ). `entries` rỗng = không kiểm bên trong.
   */
  requiredDeliverables: { filename: string; entries: string[] }[];
  materialFileNames: string[];
}

/** Suy ra "đây là file nén" từ đuôi tên — cùng idiom `workspace-files.ts`
 *  (backend) đã dùng, không phải cờ riêng. */
function archiveKindOf(filename: string): 'zip' | 'rar' | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.rar')) return 'rar';
  return null;
}

/**
 * The sheet that replaces reading the rules out loud.
 *
 * Generated from what the server already declared, so it cannot disagree
 * with what will actually be collected — the filenames here are the exact
 * ones the agent created and the exact ones that will be uploaded. Plain
 * text on purpose: it is read, not edited, and every machine can open it
 * without anything installed.
 */
export function renderInstructions(input: InstructionsInput): string {
  const endsAt = new Date(input.endTime);
  const endText = Number.isNaN(endsAt.getTime())
    ? input.endTime
    : endsAt.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

  const lines = [
    '===========================================================',
    `  ${input.sessionName}`,
    '===========================================================',
    '',
    `Sinh viên : ${input.studentName ?? '(chưa xác định)'} — MSSV ${input.studentId}`,
    `Hết giờ   : ${endText}`,
    '',
    '-- BÀI LÀM PHẢI CÓ ĐÚNG NHỮNG FILE SAU -------------------',
    '',
  ];

  for (const { filename, entries } of input.requiredDeliverables) {
    lines.push(`  * ${filename}`);

    // `.rar`: sự thật TĨNH về đuôi file — tự kiểm ở đây, không nhận qua
    // tham số. Không có cách nào hợp lệ tạo trước một RAR rỗng (xem
    // workspace-files.ts) — sinh viên PHẢI biết trước, không phải lúc
    // đang bối rối nhìn một file không mở ra được.
    if (archiveKindOf(filename) === 'rar') {
      lines.push(
        '      - Hệ thống KHÔNG tạo trước được file .rar này (không có công cụ',
        '        nén .rar cài sẵn) — tự nén bằng WinRAR, đặt đúng tên như trên.',
      );
    }

    if (entries.length > 0) {
      lines.push('      - Bên trong PHẢI có (tên file, không cần đúng thư mục):');
      for (const entry of entries) {
        lines.push(`          . ${entry}`);
      }
    }
  }

  lines.push(
    '',
    'Tên file phải giữ nguyên. File đặt tên khác sẽ KHÔNG được thu.',
    'Lưu bài ngay trong thư mục này (không lưu ra Desktop hay chỗ khác).',
    '',
  );

  if (input.materialFileNames.length > 0) {
    lines.push(`-- ĐỀ THI (thư mục ${MATERIALS_DIRNAME}/) ----------------------`, '');
    for (const file of input.materialFileNames) {
      lines.push(`  * ${file}`);
    }
    lines.push('');
  }

  lines.push(
    '-- KHI HẾT GIỜ -------------------------------------------',
    '',
    'Máy tự nộp bài, bạn không phải bấm gì. Cứ để cửa sổ agent chạy.',
    'Bài làm được sao lưu tự động vài phút một lần, nên máy hỏng giữa',
    'chừng vẫn lấy lại được.',
    '',
    'File này do hệ thống tạo ra và sẽ bị ghi đè — đừng ghi bài vào đây.',
    '',
  );

  return lines.join('\n');
}

/**
 * Writes the sheet, overwriting any earlier one.
 *
 * Overwrite, not `wx`: this is generated from the server's own data, so
 * the freshest version is always the correct one — and a stale copy
 * restored from a backup would otherwise outlive the truth. It is the one
 * file in the workspace the student is told not to write in.
 */
export async function writeInstructions(
  workspaceDir: string,
  input: InstructionsInput,
): Promise<void> {
  try {
    await fs.promises.writeFile(
      path.join(workspaceDir, INSTRUCTIONS_FILENAME),
      renderInstructions(input),
      'utf8',
    );
  } catch (error) {
    console.warn(
      `[CẢNH BÁO] Không tạo được ${INSTRUCTIONS_FILENAME}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
