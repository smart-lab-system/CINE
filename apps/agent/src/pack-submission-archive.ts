/**
 * Đóng gói workspace vào deliverable `.zip`/`.rar` lúc finalize/recollect.
 *
 * Spec: docs/superpowers/specs/2026-11-28-submission-archive-auto-pack-design.md
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import { MATERIALS_DIRNAME, INSTRUCTIONS_FILENAME } from './exam-materials';
import {
  collectPackFiles,
  type SnapshotFile,
} from './snapshot';
import { archiveKindOf } from './workspace-files';

export interface PackableDeliverable {
  requiredFilename: string;
}

export interface PackArchivesResult {
  packed: string[];
  failed: { filename: string; reason: string }[];
}

export type PackRarFn = (args: {
  workspaceDir: string;
  files: SnapshotFile[];
  destPath: string;
}) => Promise<void>;

export type FindRarExeFn = () => string | null;

const RAR_MISSING =
  'Không tìm thấy WinRAR (Rar.exe). Máy thi cần cài WinRAR khi deliverable là .rar.';

const RAR_CANDIDATES = [
  path.join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'WinRAR', 'Rar.exe'),
  path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'WinRAR', 'Rar.exe'),
];

/** Tìm Rar.exe (WinRAR) trên máy lab Windows. */
export function findRarExe(): string | null {
  for (const candidate of RAR_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function packZip(files: SnapshotFile[], destPath: string): Promise<void> {
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.relativePath, await fs.promises.readFile(file.absolutePath));
  }
  const body = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const tmp = `${destPath}.${process.pid}.${Date.now()}.tmp.zip`;
  await fs.promises.writeFile(tmp, body);
  await fs.promises.rename(tmp, destPath);
}

/**
 * Gọi WinRAR CLI: thêm từng file theo relative path, ghi ra destPath.
 * CWD = workspaceDir để đường dẫn trong archive khớp cây làm bài.
 */
export async function packRarWithWinRar(args: {
  workspaceDir: string;
  files: SnapshotFile[];
  destPath: string;
}): Promise<void> {
  const rarExe = findRarExe();
  if (!rarExe) {
    throw new Error(RAR_MISSING);
  }

  const tmp = `${args.destPath}.${process.pid}.${Date.now()}.tmp.rar`;
  try {
    await fs.promises.unlink(tmp);
  } catch {
    /* chưa có */
  }

  const listPath = path.join(
    os.tmpdir(),
    `examcollect-rar-list-${process.pid}-${Date.now()}.txt`,
  );
  // WinRAR listfile: một đường dẫn tương đối mỗi dòng. Không dùng -ep1 để
  // giữ nguyên `src\Main.java` (không chỉ còn basename).
  const listBody = args.files
    .map((f) => f.relativePath.replace(/\//g, path.sep))
    .join('\n');
  await fs.promises.writeFile(listPath, listBody, 'utf8');

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        rarExe,
        ['a', '-y', '-inul', tmp, `@${listPath}`],
        { cwd: args.workspaceDir, windowsHide: true },
      );
      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (err) => reject(err));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else {
          reject(
            new Error(
              `WinRAR thoát mã ${code ?? 'null'}${stderr ? `: ${stderr.trim()}` : ''}`,
            ),
          );
        }
      });
    });
    await fs.promises.rename(tmp, args.destPath);
  } finally {
    try {
      await fs.promises.unlink(listPath);
    } catch {
      /* ignore */
    }
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Với mỗi deliverable `.zip`/`.rar`: nén workspace (đã ignore) ghi đè file nộp.
 * Deliverable không phải archive → bỏ qua.
 */
export async function packSubmissionArchives(
  workspaceDir: string,
  deliverables: PackableDeliverable[],
  deps?: {
    packRar?: PackRarFn;
    findRar?: FindRarExeFn;
  },
): Promise<PackArchivesResult> {
  const packed: string[] = [];
  const failed: { filename: string; reason: string }[] = [];

  const archiveDeliverables = deliverables.filter(
    (d) => archiveKindOf(d.requiredFilename) !== null,
  );
  if (archiveDeliverables.length === 0) {
    return { packed, failed };
  }

  const allRootNames = new Set(deliverables.map((d) => d.requiredFilename));
  allRootNames.add(INSTRUCTIONS_FILENAME);

  for (const deliverable of archiveDeliverables) {
    const filename = deliverable.requiredFilename;
    const kind = archiveKindOf(filename)!;
    const excludeRootNames = new Set(allRootNames);

    const collected = collectPackFiles(workspaceDir, {
      excludeRootNames,
      extraIgnoredDirectories: new Set([MATERIALS_DIRNAME]),
    });

    if (!collected.ok) {
      failed.push({ filename, reason: collected.reason });
      continue;
    }

    if (collected.files.length === 0) {
      failed.push({
        filename,
        reason: 'Không có file nào trong thư mục bài làm để đóng gói (sau khi bỏ ignore).',
      });
      continue;
    }

    const destPath = path.join(workspaceDir, filename);
    try {
      if (kind === 'zip') {
        await packZip(collected.files, destPath);
      } else {
        const rarAvailable = (deps?.findRar ?? findRarExe)();
        if (!deps?.packRar && !rarAvailable) {
          failed.push({ filename, reason: RAR_MISSING });
          continue;
        }
        const packRar = deps?.packRar ?? packRarWithWinRar;
        await packRar({
          workspaceDir,
          files: collected.files,
          destPath,
        });
      }
      packed.push(filename);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ filename, reason: message });
    }
  }

  return { packed, failed };
}
