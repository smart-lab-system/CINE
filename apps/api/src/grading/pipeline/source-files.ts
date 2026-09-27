import * as yauzl from 'yauzl';
import { detectArchiveFormat } from '../../submission/archive-check/archive-reader';
import type { SandboxLanguage } from '../../sandbox/contract';
import { ArchiveEntry, planExtraction, SOURCE_EXTRACTION_LIMITS } from './archive-rules';

export type SourceFiles =
  | { kind: 'ok'; files: { path: string; content: string }[]; entry: string | null; dropped: string[] }
  | { kind: 'ungradable'; class: 'submission' | 'system'; reason: string };

const SOURCE_EXTENSIONS: Record<SandboxLanguage, ReadonlySet<string>> = {
  cpp: new Set(['.cpp', '.cc', '.cxx', '.h', '.hpp']),
  python: new Set(['.py']),
};

const submission = (reason: string): SourceFiles => ({ kind: 'ungradable', class: 'submission', reason });

/**
 * Byte bài nộp → file mã nguồn cho `investigate()`. Không tin gì của bài nộp: file nén nhận dạng
 * bằng magic byte chứ không bằng đuôi tên; trần quyết từ header TRƯỚC khi mở stream nào, rồi đếm
 * byte thật lúc đọc vì header nói dối được. Hỏng ở đây là lỗi của BÀI — chấm lại ra đúng kết quả
 * cũ (§4.4: *"file nén không đọc được"* → `submission`).
 *
 * Tên file không qua khuôn của sandbox KHÔNG kiểm ở đây: `programProblem()` của cuộc điều tra đã
 * kiểm bằng chính schema của job và xếp lớp cho nó — một chỗ phán, không hai.
 */
export async function sourceFilesOf(bytes: Buffer, declaredFilename: string, language: SandboxLanguage): Promise<SourceFiles> {
  const format = detectArchiveFormat(bytes);
  if (format === 'rar') return submission('bài nộp dạng RAR — đường chấm điều tra chỉ đọc ZIP; chấm tay');
  if (format === 'unknown') {
    const content = decode(bytes);
    if (content === null) return submission(`bài nộp "${short(declaredFilename)}" không phải file văn bản`);
    const path = language === 'cpp' ? 'main.cpp' : 'main.py';
    return { kind: 'ok', files: [{ path, content }], entry: language === 'python' ? path : null, dropped: [] };
  }

  let read: { path: string; bytes: Buffer }[];
  const dropped: string[] = [];
  try {
    read = await readZip(bytes, (name) => {
      const segments = name.replace(/\\/g, '/').split('/').filter((s) => s.length > 0);
      if (segments[0] === '__MACOSX' || segments.some((s) => s.startsWith('.'))) return false;
      const dot = name.lastIndexOf('.');
      return dot !== -1 && SOURCE_EXTENSIONS[language].has(name.slice(dot).toLowerCase());
    }, dropped);
  } catch (error) {
    return submission(error instanceof ZipRefusal ? error.message : 'file nén không đọc được');
  }

  const files: { path: string; content: string }[] = [];
  for (const f of read) {
    const content = decode(f.bytes);
    if (content === null) dropped.push(f.path);
    else files.push({ path: f.path, content });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  if (files.length === 0) return submission('bài nộp không có file mã nguồn nào');

  let entry: string | null = null;
  if (language === 'python') {
    const main = files.find((f) => f.path === 'main.py' || f.path.endsWith('/main.py'));
    if (main) entry = main.path;
    else if (files.length === 1) entry = files[0].path;
    else return submission('không xác định được file chạy — bài Python nhiều file cần main.py');
  }
  return { kind: 'ok', files, entry, dropped };
}

class ZipRefusal extends Error {}

/** UTF-8, bỏ BOM; có byte NUL là nhị phân → null. */
function decode(bytes: Buffer): string | null {
  if (bytes.includes(0)) return null;
  return bytes.toString('utf8').replace(/^﻿/, '');
}

function short(name: string): string {
  return name.slice(0, 80);
}

/**
 * Đọc zip trong bộ nhớ: lần 1 chỉ đọc header (không mở stream nào), quyết bằng `planExtraction`;
 * lần 2 mở stream cho đúng entry được lấy và là mã nguồn, đếm byte thật.
 */
function readZip(bytes: Buffer, wanted: (path: string) => boolean, dropped: string[]): Promise<{ path: string; bytes: Buffer }[]> {
  const limits = SOURCE_EXTRACTION_LIMITS;
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, autoClose: false, validateEntrySizes: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(refusalOf(openError));
        return;
      }
      const all: { meta: ArchiveEntry; entry: yauzl.Entry }[] = [];
      const fail = (error: unknown) => {
        zipfile.close();
        reject(refusalOf(error));
      };
      zipfile.on('error', fail);
      zipfile.on('entry', (entry: yauzl.Entry) => {
        const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
        all.push({
          entry,
          meta: {
            path: entry.fileName,
            uncompressedSize: entry.uncompressedSize,
            isDirectory: entry.fileName.endsWith('/'),
            isSymlink: mode === 0xa000,
          },
        });
        zipfile.readEntry();
      });
      zipfile.on('end', () => {
        const plan = planExtraction(
          all.map((a) => a.meta),
          limits,
        );
        if (plan.refusal) return fail(new ZipRefusal(`file nén bị từ chối: ${plan.refusal}`));
        // Entry thù địch (đường dẫn thoát ra ngoài, tuyệt đối, symlink) → cả file nén là thù địch.
        // Entry chỉ QUÁ TO: là mã nguồn thì không chấm trung thực được → từ chối; không phải mã
        // nguồn (file dữ liệu, ảnh) thì chỉ bỏ nó.
        for (const r of plan.rejected) {
          const oversized = r.reason.startsWith('file vượt');
          if (!oversized || wanted(r.path)) {
            return fail(new ZipRefusal(`file nén bị từ chối: "${short(r.path)}" — ${r.reason}`));
          }
          dropped.push(r.path);
        }
        const safeOf = new Map(plan.take.map((t) => [t.path, t.safePath]));
        const chosen = all.filter((a) => {
          // Entry bị loại ở trên (quá to, không phải mã nguồn) đã nằm trong `dropped`.
          if (a.meta.isDirectory || !safeOf.has(a.meta.path)) return false;
          if (wanted(a.meta.path)) return true;
          dropped.push(safeOf.get(a.meta.path) ?? a.meta.path);
          return false;
        });
        readAll(zipfile, chosen, safeOf, limits.maxFileBytes)
          .then((out) => {
            zipfile.close();
            resolve(out);
          })
          .catch(fail);
      });
      zipfile.readEntry();
    });
  });
}

async function readAll(
  zipfile: yauzl.ZipFile,
  chosen: { meta: ArchiveEntry; entry: yauzl.Entry }[],
  safeOf: Map<string, string>,
  maxFileBytes: number,
): Promise<{ path: string; bytes: Buffer }[]> {
  const out: { path: string; bytes: Buffer }[] = [];
  for (const c of chosen) {
    const path = safeOf.get(c.meta.path) ?? c.meta.path;
    out.push({ path, bytes: await readEntry(zipfile, c.entry, path, maxFileBytes) });
  }
  return out;
}

function readEntry(zipfile: yauzl.ZipFile, entry: yauzl.Entry, path: string, maxFileBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zipfile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error('không đọc được entry'));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      stream.on('data', (chunk: Buffer) => {
        total += chunk.length;
        // Header nói dối được: đếm byte THẬT, dừng ngay khi vượt trần — không đọc hết bom vào bộ nhớ.
        if (total > maxFileBytes) {
          stream.destroy();
          reject(new ZipRefusal(`file nén bị từ chối: "${short(path)}" vượt ${maxFileBytes} byte sau giải nén`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('error', (e: unknown) => reject(refusalOf(e, path)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  });
}

/** Lỗi thư viện không lọt nguyên văn ra: người đọc lý do là giảng viên. */
function refusalOf(error: unknown, path?: string): Error {
  if (error instanceof ZipRefusal) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/too many bytes|too few bytes|size mismatch/i.test(message)) {
    return new ZipRefusal(`file nén bị từ chối: "${short(path ?? '?')}" vượt kích thước khai trong file nén`);
  }
  if (/relative path|invalid characters|absolute path|fileName/i.test(message)) {
    return new ZipRefusal('file nén bị từ chối: chứa đường dẫn không hợp lệ (thoát ra ngoài thư mục, hoặc ký tự cấm)');
  }
  return new ZipRefusal('file nén không đọc được');
}
