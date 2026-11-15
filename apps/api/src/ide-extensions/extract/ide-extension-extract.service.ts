import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as yauzl from 'yauzl';
import { StorageService } from '../../storage/storage.service';
import { IdeExtensionVersionEntity } from '../entities/ide-extension-version.entity';
import {
  IDE_EXTENSION_EXTRACT_MAX_ARCHIVE_BYTES,
  IDE_EXTENSION_EXTRACT_MAX_ENTRIES,
  IDE_EXTENSION_EXTRACT_MAX_FILE_BYTES,
  IDE_EXTENSION_EXTRACT_MAX_UNCOMPRESSED_BYTES,
} from './ide-extension-extract.constants';
import {
  guessExtractContentType,
  sanitizeExtractRelativePath,
  UnsafeExtractPathError,
} from './ide-extension-extract-path';
import type { ExtractTreeDocument, ExtractTreeNode } from './ide-extension-extract.types';

/** Permanent / policy failures — processor should not burn remaining attempts. */
export class IdeExtensionExtractFatalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdeExtensionExtractFatalError';
  }
}

@Injectable()
export class IdeExtensionExtractService {
  private readonly logger = new Logger(IdeExtensionExtractService.name);

  constructor(
    private readonly storage: StorageService,
    @InjectRepository(IdeExtensionVersionEntity)
    private readonly versions: Repository<IdeExtensionVersionEntity>,
  ) {}

  async processOne(versionId: string): Promise<void> {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) {
      throw new IdeExtensionExtractFatalError(`Không tìm thấy phiên bản ${versionId}.`);
    }
    if (!row.storageKey) {
      await this.markFailed(row, 'Thiếu storage_key — chưa có file .vsix.');
      throw new IdeExtensionExtractFatalError('Thiếu storage_key.');
    }

    row.extractStatus = 'extracting';
    row.extractError = null;
    row.extractStartedAt = new Date();
    row.extractFinishedAt = null;
    await this.versions.save(row);

    try {
      const size = await this.storage.getObjectSize(row.storageKey);
      if (size === null) {
        throw new IdeExtensionExtractFatalError('Object .vsix không tồn tại trên kho lưu trữ.');
      }
      if (size > IDE_EXTENSION_EXTRACT_MAX_ARCHIVE_BYTES) {
        throw new IdeExtensionExtractFatalError(
          `File .vsix quá lớn (${size} byte, trần ${IDE_EXTENSION_EXTRACT_MAX_ARCHIVE_BYTES}).`,
        );
      }

      const archive = await this.storage.getObject(row.storageKey);
      const { files, entryCount, totalBytes } = await this.unpackVsix(archive);

      for (const file of files) {
        const key = this.storage.buildIdeExtensionExtractedFileKey(
          row.extensionPk,
          row.id,
          file.path,
        );
        await this.storage.putObject(key, file.bytes, guessExtractContentType(file.path));
      }

      const tree = buildExtractTree(files.map((f) => ({ path: f.path, size: f.bytes.length })));
      const treeKey = this.storage.buildIdeExtensionTreeKey(row.extensionPk, row.id);
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
      await this.versions.save(row);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Lỗi không xác định: ${String(error)}`;
      this.logger.warn(`version ${versionId}: extract failed — ${message}`);
      await this.markFailed(row, message);
      if (
        error instanceof IdeExtensionExtractFatalError ||
        error instanceof UnsafeExtractPathError
      ) {
        throw error;
      }
      throw error;
    }
  }

  async markFailedPermanent(versionId: string, reason: string): Promise<void> {
    const row = await this.versions.findOne({ where: { id: versionId } });
    if (!row) return;
    await this.markFailed(row, reason);
  }

  private async markFailed(row: IdeExtensionVersionEntity, message: string): Promise<void> {
    row.extractStatus = 'failed';
    row.extractError = message.slice(0, 2000);
    row.extractFinishedAt = new Date();
    await this.versions.save(row);
  }

  private unpackVsix(archive: Buffer): Promise<{
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
              new IdeExtensionExtractFatalError(
                openError?.message ?? 'Không mở được file .vsix (ZIP).',
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
            if (entryCount > IDE_EXTENSION_EXTRACT_MAX_ENTRIES) {
              fail(
                new IdeExtensionExtractFatalError(
                  `Quá nhiều entry (trần ${IDE_EXTENSION_EXTRACT_MAX_ENTRIES}).`,
                ),
              );
              return;
            }

            if (isSymlink) {
              fail(
                new IdeExtensionExtractFatalError(
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

            if (entry.uncompressedSize > IDE_EXTENSION_EXTRACT_MAX_FILE_BYTES) {
              fail(
                new IdeExtensionExtractFatalError(
                  `File "${relativePath}" vượt trần ${IDE_EXTENSION_EXTRACT_MAX_FILE_BYTES} byte.`,
                ),
              );
              return;
            }

            totalBytes += entry.uncompressedSize;
            if (totalBytes > IDE_EXTENSION_EXTRACT_MAX_UNCOMPRESSED_BYTES) {
              fail(
                new IdeExtensionExtractFatalError(
                  `Tổng uncompressed vượt trần ${IDE_EXTENSION_EXTRACT_MAX_UNCOMPRESSED_BYTES} byte.`,
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
                if (read > IDE_EXTENSION_EXTRACT_MAX_FILE_BYTES) {
                  stream.destroy();
                  fail(
                    new IdeExtensionExtractFatalError(
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
