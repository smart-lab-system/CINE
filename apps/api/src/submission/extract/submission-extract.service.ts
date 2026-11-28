import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import * as yauzl from 'yauzl';
import { renderFilename } from '../../exam-session/filename-template';
import { StorageService } from '../../storage/storage.service';
import { detectArchiveFormat } from '../archive-check/archive-reader';
import { SubmissionEntity } from '../entities/submission.entity';
import {
  guessExtractContentType,
  sanitizeExtractRelativePath,
  UnsafeExtractPathError,
} from '../../ide-extensions/extract/ide-extension-extract-path';
import {
  SUBMISSION_EXTRACT_MAX_ARCHIVE_BYTES,
  SUBMISSION_EXTRACT_MAX_ENTRIES,
  SUBMISSION_EXTRACT_MAX_FILE_BYTES,
  SUBMISSION_EXTRACT_MAX_UNCOMPRESSED_BYTES,
  SUBMISSION_EXTRACT_QUEUE,
} from './submission-extract.constants';
import {
  SUBMISSION_EXTRACT_JOB_OPTIONS,
  type ExtractTreeDocument,
  type ExtractTreeNode,
  type SubmissionExtractStatusView,
} from './submission-extract.types';

/** Permanent / policy failures — processor should not burn remaining attempts. */
export class SubmissionExtractFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionExtractFatalError';
  }
}

@Injectable()
export class SubmissionExtractService {
  private readonly logger = new Logger(SubmissionExtractService.name);

  constructor(
    private readonly storage: StorageService,
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    @InjectQueue(SUBMISSION_EXTRACT_QUEUE)
    private readonly extractQueue: Queue,
  ) {}

  async processOne(submissionId: string): Promise<void> {
    const row = await this.submissions.findOne({
      where: { id: submissionId },
      relations: ['requiredDeliverable', 'examSession'],
    });
    if (!row) {
      throw new SubmissionExtractFatalError(`Không tìm thấy bài nộp ${submissionId}.`);
    }
    if (!row.storageKey) {
      await this.markFailed(row, 'Thiếu storage_key — chưa có file bài nộp.');
      throw new SubmissionExtractFatalError('Thiếu storage_key.');
    }

    row.extractStatus = 'extracting';
    row.extractError = null;
    row.extractStartedAt = new Date();
    row.extractFinishedAt = null;
    await this.submissions.save(row);

    try {
      const size = await this.storage.getObjectSize(row.storageKey);
      if (size === null) {
        throw new SubmissionExtractFatalError('Object bài nộp không tồn tại trên kho lưu trữ.');
      }
      if (size > SUBMISSION_EXTRACT_MAX_ARCHIVE_BYTES) {
        throw new SubmissionExtractFatalError(
          `File bài nộp quá lớn (${size} byte, trần ${SUBMISSION_EXTRACT_MAX_ARCHIVE_BYTES}).`,
        );
      }

      const bytes = await this.storage.getObject(row.storageKey);
      const format = detectArchiveFormat(bytes);

      let files: { path: string; bytes: Buffer }[];
      let entryCount: number;
      let totalBytes: number;

      if (format === 'rar') {
        throw new SubmissionExtractFatalError(
          'Chưa hỗ trợ giải nén RAR để xem trong trình duyệt. Tải file gốc về để mở tay.',
        );
      }

      if (format === 'zip') {
        ({ files, entryCount, totalBytes } = await this.unpackZip(bytes));
      } else {
        const displayName = this.singleFileDisplayName(row);
        files = [{ path: displayName, bytes }];
        entryCount = 1;
        totalBytes = bytes.length;
      }

      for (const file of files) {
        const key = this.storage.buildSubmissionExtractedFileKey(
          row.examSessionId,
          row.studentMssv,
          row.requiredDeliverableId,
          file.path,
        );
        await this.storage.putObject(key, file.bytes, guessExtractContentType(file.path));
      }

      const tree = buildExtractTree(files.map((f) => ({ path: f.path, size: f.bytes.length })));
      const treeKey = this.storage.buildSubmissionTreeKey(
        row.examSessionId,
        row.studentMssv,
        row.requiredDeliverableId,
      );
      await this.storage.putObject(
        treeKey,
        Buffer.from(JSON.stringify(tree), 'utf8'),
        'application/json',
      );

      row.extractStatus = 'ready';
      row.extractTreeKey = treeKey;
      row.extractError = null;
      row.extractEntryCount = entryCount;
      row.extractTotalBytes = String(totalBytes);
      row.extractFinishedAt = new Date();
      await this.submissions.save(row);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Lỗi không xác định: ${String(error)}`;
      this.logger.warn(`submission ${submissionId}: extract failed — ${message}`);
      await this.markFailed(row, message);
      if (
        error instanceof SubmissionExtractFatalError ||
        error instanceof UnsafeExtractPathError
      ) {
        throw error;
      }
      throw error;
    }
  }

  async markFailedPermanent(submissionId: string, reason: string): Promise<void> {
    const row = await this.submissions.findOne({ where: { id: submissionId } });
    if (!row) return;
    await this.markFailed(row, reason);
  }

  /**
   * Đặt `pending` + enqueue (idempotent jobId). Bỏ qua nếu đã pending/extracting/ready
   * trừ khi `force` (re-confirm upload).
   */
  async enqueueExtract(submissionId: string, opts?: { force?: boolean }): Promise<void> {
    const row = await this.submissions.findOne({ where: { id: submissionId } });
    if (!row?.storageKey) return;

    if (!opts?.force) {
      if (
        row.extractStatus === 'pending' ||
        row.extractStatus === 'extracting' ||
        row.extractStatus === 'ready'
      ) {
        if (row.extractStatus === 'pending' || row.extractStatus === 'extracting') {
          await this.addJob(submissionId);
        }
        return;
      }
    }

    row.extractStatus = 'pending';
    row.extractError = null;
    row.extractTreeKey = null;
    row.extractEntryCount = null;
    row.extractTotalBytes = null;
    row.extractStartedAt = null;
    row.extractFinishedAt = null;
    await this.submissions.save(row);
    await this.addJob(submissionId);
  }

  async requestExtract(submissionId: string): Promise<SubmissionExtractStatusView> {
    const row = await this.submissions.findOne({ where: { id: submissionId } });
    if (!row) {
      throw new SubmissionExtractFatalError(`Không tìm thấy bài nộp ${submissionId}.`);
    }
    if (!row.storageKey) {
      throw new SubmissionExtractFatalError('Thiếu storage_key — chưa có file bài nộp.');
    }
    if (row.extractStatus === 'pending' || row.extractStatus === 'extracting') {
      return this.toStatusView(row);
    }
    if (row.extractStatus === 'ready') {
      return this.toStatusView(row);
    }

    row.extractStatus = 'pending';
    row.extractError = null;
    row.extractStartedAt = null;
    row.extractFinishedAt = null;
    const saved = await this.submissions.save(row);
    await this.addJob(saved.id);
    return this.toStatusView(saved);
  }

  toStatusView(row: SubmissionEntity): SubmissionExtractStatusView {
    return {
      status: row.extractStatus,
      entryCount: row.extractEntryCount,
      error: row.extractError,
    };
  }

  private async addJob(submissionId: string): Promise<void> {
    const jobId = `submission-extract-${submissionId}`;
    try {
      const existing = await this.extractQueue.getJob(jobId);
      if (existing) {
        const state = await existing.getState();
        if (state === 'active' || state === 'waiting' || state === 'delayed') {
          this.logger.debug(`extract job already ${state} for ${submissionId}`);
          return;
        }
        await existing.remove();
      }
      await this.extractQueue.add(
        'extract',
        { submissionId },
        { ...SUBMISSION_EXTRACT_JOB_OPTIONS, jobId },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/already|exist|duplicate/i.test(message)) {
        this.logger.debug(`extract job already queued for ${submissionId}`);
        return;
      }
      this.logger.error(
        `Không đẩy được job giải nén cho submission ${submissionId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private singleFileDisplayName(row: SubmissionEntity): string {
    const pattern = row.requiredDeliverable?.requiredFilename ?? 'submission.bin';
    const rendered = renderFilename(pattern, {
      studentMssv: row.studentMssv,
      studentName: row.studentNameInput ?? '',
      roomName: row.examSession?.roomName ?? '',
      machineName: null,
    });
    const base = rendered.replace(/\\/g, '/').split('/').pop() || 'submission.bin';
    try {
      return sanitizeExtractRelativePath(base);
    } catch {
      return 'submission.bin';
    }
  }

  private async markFailed(row: SubmissionEntity, message: string): Promise<void> {
    row.extractStatus = 'failed';
    row.extractError = message.slice(0, 2000);
    row.extractFinishedAt = new Date();
    await this.submissions.save(row);
  }

  private unpackZip(archive: Buffer): Promise<{
    files: { path: string; bytes: Buffer }[];
    entryCount: number;
    totalBytes: number;
  }> {
    return new Promise((resolve, reject) => {
      yauzl.fromBuffer(
        archive,
        { lazyEntries: true, autoClose: false, validateEntrySizes: true },
        (openError, zipfile) => {
          if (openError || !zipfile) {
            reject(
              new SubmissionExtractFatalError(
                openError?.message ?? 'Không mở được file ZIP bài nộp.',
              ),
            );
            return;
          }

          const files: { path: string; bytes: Buffer }[] = [];
          let entryCount = 0;
          let totalBytes = 0;
          let failed = false;

          const fail = (error: unknown) => {
            if (failed) return;
            failed = true;
            try {
              zipfile.close();
            } catch {
              /* ignore */
            }
            reject(error instanceof Error ? error : new Error(String(error)));
          };

          zipfile.on('error', fail);
          zipfile.on('end', () => {
            if (failed) return;
            try {
              zipfile.close();
            } catch {
              /* ignore */
            }
            resolve({ files, entryCount, totalBytes });
          });

          zipfile.on('entry', (entry: yauzl.Entry) => {
            if (failed) return;

            const mode = (entry.externalFileAttributes >>> 16) & 0xf000;
            const isSymlink = mode === 0xa000;
            const isDirectory = /\/$/.test(entry.fileName);

            entryCount += 1;
            if (entryCount > SUBMISSION_EXTRACT_MAX_ENTRIES) {
              fail(
                new SubmissionExtractFatalError(
                  `Quá nhiều entry (trần ${SUBMISSION_EXTRACT_MAX_ENTRIES}).`,
                ),
              );
              return;
            }

            if (isSymlink) {
              fail(
                new SubmissionExtractFatalError(
                  `Symlink bị từ chối: ${JSON.stringify(entry.fileName)}`,
                ),
              );
              return;
            }

            let relativePath: string;
            try {
              relativePath = sanitizeExtractRelativePath(entry.fileName);
            } catch (error) {
              fail(error);
              return;
            }

            if (isDirectory) {
              zipfile.readEntry();
              return;
            }

            if (entry.uncompressedSize > SUBMISSION_EXTRACT_MAX_FILE_BYTES) {
              fail(
                new SubmissionExtractFatalError(
                  `File "${relativePath}" vượt trần ${SUBMISSION_EXTRACT_MAX_FILE_BYTES} byte.`,
                ),
              );
              return;
            }

            totalBytes += entry.uncompressedSize;
            if (totalBytes > SUBMISSION_EXTRACT_MAX_UNCOMPRESSED_BYTES) {
              fail(
                new SubmissionExtractFatalError(
                  `Tổng uncompressed vượt trần ${SUBMISSION_EXTRACT_MAX_UNCOMPRESSED_BYTES} byte.`,
                ),
              );
              return;
            }

            zipfile.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) {
                fail(streamError ?? new Error(`Không đọc được entry ${relativePath}`));
                return;
              }
              const chunks: Buffer[] = [];
              let read = 0;
              stream.on('data', (chunk: Buffer) => {
                read += chunk.length;
                if (read > SUBMISSION_EXTRACT_MAX_FILE_BYTES) {
                  stream.destroy();
                  fail(
                    new SubmissionExtractFatalError(
                      `File "${relativePath}" vượt trần sau khi giải nén.`,
                    ),
                  );
                  return;
                }
                chunks.push(chunk);
              });
              stream.on('error', fail);
              stream.on('end', () => {
                if (failed) return;
                files.push({ path: relativePath, bytes: Buffer.concat(chunks) });
                zipfile.readEntry();
              });
            });
          });

          zipfile.readEntry();
        },
      );
    });
  }
}

export function buildExtractTree(
  files: { path: string; size: number }[],
): ExtractTreeDocument {
  type DirAcc = { name: string; type: 'dir'; children: Map<string, DirAcc | FileAcc> };
  type FileAcc = { name: string; type: 'file'; size: number };

  const root: DirAcc = { name: '', type: 'dir', children: new Map() };

  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i += 1) {
      const name = parts[i]!;
      const isLast = i === parts.length - 1;
      if (isLast) {
        node.children.set(name, { name, type: 'file', size: file.size });
      } else {
        let next = node.children.get(name);
        if (!next || next.type !== 'dir') {
          next = { name, type: 'dir', children: new Map() };
          node.children.set(name, next);
        }
        node = next;
      }
    }
  }

  const toNodes = (dir: DirAcc): ExtractTreeNode[] => {
    const entries = [...dir.children.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return entries.map((entry) => {
      if (entry.type === 'file') {
        return { name: entry.name, type: 'file', size: entry.size };
      }
      return { name: entry.name, type: 'dir', children: toNodes(entry) };
    });
  };

  return { root: toNodes(root) };
}
