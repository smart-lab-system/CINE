import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { access } from 'node:fs/promises';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { scanEntry, type ConsoleLanguage, type PlaygroundLanguage } from './entry-scanner';
import { scanHtmlEntry } from './html-entry';
import {
  PlaygroundRunEntity,
  type PlaygroundRunStatus,
} from './entities/playground-run.entity';
import {
  PLAYGROUND_JOB_OPTIONS,
  PLAYGROUND_LANGUAGES,
  PLAYGROUND_QUEUE,
  PLAYGROUND_EXPRESS_TTL_MS,
  PLAYGROUND_SPRING_TTL_MS,
  PLAYGROUND_STATIC_TTL_MS,
  PLAYGROUND_VITE_TTL_MS,
} from './playground.constants';
import { runConsoleInDocker } from './console-runner';
import { startExpressPreview, stopExpressPreview } from './express-preview';
import { startSpringBootPreview, stopSpringBootPreview } from './spring-boot-preview';
import { startStaticPreview, stopStaticPreview } from './static-preview';
import { startVitePreview, stopVitePreview } from './vite-preview';
import {
  conventionName,
  copyExpressProjectIntoWorkDir,
  copySpringProjectIntoWorkDir,
  copyTreeIntoWorkDir,
  copyViteProjectIntoWorkDir,
  ensureWorkDir,
  extractZipToWorkDir,
  loadSourceFiles,
  pickExpressEntry,
  remapWorkDirStripRoot,
  sampleExpressProjectDir,
  sampleSpringBootProjectDir,
  sampleStaticProjectDir,
  sampleViteReactProjectDir,
  stripSingleRootDir,
  writeFiles,
} from './workspace';

export interface PlaygroundRunView {
  id: string;
  language: PlaygroundLanguage;
  status: PlaygroundRunStatus;
  entryPath: string | null;
  entryDetection: string | null;
  candidates: string[] | null;
  filePaths: string[];
  console: {
    compileLog: string | null;
    stdout: string | null;
    stderr: string | null;
    exitCode: number | null;
  };
  previewUrl: string | null;
  expiresAt: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

@Injectable()
export class PlaygroundService {
  constructor(
    @InjectRepository(PlaygroundRunEntity)
    private readonly runs: Repository<PlaygroundRunEntity>,
    @InjectQueue(PLAYGROUND_QUEUE)
    private readonly queue: Queue<{ runId: string }>,
  ) {}

  toView(row: PlaygroundRunEntity): PlaygroundRunView {
    return {
      id: row.id,
      language: row.language,
      status: row.status,
      entryPath: row.entryPath,
      entryDetection: row.entryDetection,
      candidates: row.candidates,
      filePaths: row.filePaths,
      console: {
        compileLog: row.compileLog,
        stdout: row.stdout,
        stderr: row.stderr,
        exitCode: row.exitCode,
      },
      previewUrl: row.previewUrl,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    };
  }

  private assertLanguage(language: string): PlaygroundLanguage {
    if (!(PLAYGROUND_LANGUAGES as readonly string[]).includes(language)) {
      throw new BadRequestException(`language không hỗ trợ: ${language}`);
    }
    return language as PlaygroundLanguage;
  }

  private emptyRow(accountId: string, language: PlaygroundLanguage): PlaygroundRunEntity {
    return this.runs.create({
      createdByAccountId: accountId,
      language,
      status: 'created',
      entryPath: null,
      entryDetection: null,
      candidates: null,
      filePaths: [],
      compileLog: null,
      stdout: null,
      stderr: null,
      exitCode: null,
      error: null,
      startedAt: null,
      finishedAt: null,
      previewUrl: null,
      containerName: null,
      hostPort: null,
      expiresAt: null,
    });
  }

  async createFromPaste(
    accountId: string,
    languageRaw: string,
    source: string,
  ): Promise<PlaygroundRunView> {
    const language = this.assertLanguage(languageRaw);
    if (
      language === 'static' ||
      language === 'spring-boot' ||
      language === 'vite-react' ||
      language === 'express'
    ) {
      const msg =
        language === 'static'
          ? 'web tĩnh cần upload zip/thư mục hoặc dùng sample'
          : language === 'spring-boot'
            ? 'Spring Boot cần upload project (có pom.xml) hoặc dùng sample Shopping'
            : language === 'vite-react'
              ? 'Vite/React cần upload project (package.json) hoặc dùng sample PTUD'
              : 'Express cần upload project (app.js + package.json) hoặc dùng sample CNM';
      throw new BadRequestException(msg);
    }
    if (!source?.trim()) throw new BadRequestException('source trống');

    const row = this.emptyRow(accountId, language);
    await this.runs.save(row);

    const workDir = await ensureWorkDir(row.id);
    const name = conventionName(language);
    const paths = await writeFiles(workDir, [{ path: name, content: source }]);
    return this.applyScan(row, workDir, paths);
  }

  async createFromUploads(
    accountId: string,
    languageRaw: string,
    files: Express.Multer.File[],
    /** Path relative song song với files[] — browser thường cắt path trong filename multipart. */
    relativePaths?: string[],
  ): Promise<PlaygroundRunView> {
    const language = this.assertLanguage(languageRaw);
    if (!files?.length) throw new BadRequestException('chưa có file upload');

    const row = this.emptyRow(accountId, language);
    await this.runs.save(row);

    const workDir = await ensureWorkDir(row.id);
    const paths: string[] = [];
    const staticMode = language === 'static';
    const springMode = language === 'spring-boot';
    const viteMode = language === 'vite-react';
    const expressMode = language === 'express';
    const binaryOk = staticMode || springMode || viteMode || expressMode;

    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      const hinted = relativePaths?.[i]?.replace(/\\/g, '/').replace(/^\/+/, '');
      const original = (hinted || f.originalname).replace(/\\/g, '/');
      // webkitRelativePath đôi khi gồm cả tên folder gốc: "M18_.../html/index.html"
      const base = original.includes('/') ? original.split('/').pop()! : original;
      if (base.toLowerCase().endsWith('.zip') || f.mimetype === 'application/zip') {
        const unzipped = await extractZipToWorkDir(f.buffer, workDir, {
          staticMode,
          springMode,
          viteMode,
          expressMode,
        });
        paths.push(...unzipped);
        continue;
      }
      const rel =
        files.length === 1 &&
        !staticMode &&
        !springMode &&
        !viteMode &&
        !expressMode &&
        !hinted
          ? conventionName(language)
          : original.includes('/')
            ? original
            : base || conventionName(language);
      await writeFiles(workDir, [{ path: rel, content: f.buffer }], { binaryOk });
      paths.push(rel.replace(/\\/g, '/'));
    }

    // Zip/folder bọc 1 thư mục gốc duy nhất → bỏ prefix để html/ + ../css khớp
    const normalized = stripSingleRootDir(paths);
    if (normalized.stripped && normalized.paths !== paths) {
      await remapWorkDirStripRoot(workDir, normalized.rootPrefix!);
    }

    const finalPaths = normalized.paths;
    if (finalPaths.length === 0) {
      row.status = 'failed';
      row.error = 'không có file nào sau upload';
      await this.runs.save(row);
      return this.toView(row);
    }

    return this.applyScan(row, workDir, [...new Set(finalPaths)]);
  }

  /** Nạp sample project web tĩnh từ thư mục monorepo. */
  async createFromSampleStatic(accountId: string): Promise<PlaygroundRunView> {
    const sampleDir = sampleStaticProjectDir();
    try {
      await access(sampleDir);
    } catch {
      throw new BadRequestException(
        `không tìm thấy sample: ${sampleDir} — đặt PLAYGROUND_SAMPLE_STATIC_DIR hoặc giữ "sample project/M18_..."`,
      );
    }

    const row = this.emptyRow(accountId, 'static');
    await this.runs.save(row);
    const workDir = await ensureWorkDir(row.id);
    const paths = await copyTreeIntoWorkDir(sampleDir, workDir);
    // Đảm bảo còn html/ + css/ (không phẳng)
    if (!paths.some((p) => p.startsWith('html/') || p === 'html/index.html')) {
      row.status = 'failed';
      row.error = `sample copy lệch cấu trúc (cần html/, css/): ${paths.slice(0, 8).join(', ')}`;
      row.filePaths = paths;
      await this.runs.save(row);
      return this.toView(row);
    }
    return this.applyScan(row, workDir, paths);
  }

  /** Nạp sample Spring Boot Shopping. */
  async createFromSampleSpringBoot(accountId: string): Promise<PlaygroundRunView> {
    const sampleDir = sampleSpringBootProjectDir();
    try {
      await access(sampleDir);
    } catch {
      throw new BadRequestException(
        `không tìm thấy sample Spring: ${sampleDir} — giữ "sample project/22681861_NguyenGiaBao_Shopping"`,
      );
    }

    const row = this.emptyRow(accountId, 'spring-boot');
    await this.runs.save(row);
    const workDir = await ensureWorkDir(row.id);
    const paths = await copySpringProjectIntoWorkDir(sampleDir, workDir);
    if (!paths.includes('pom.xml') && !paths.some((p) => p.endsWith('/pom.xml'))) {
      row.status = 'failed';
      row.error = 'sample thiếu pom.xml';
      row.filePaths = paths;
      await this.runs.save(row);
      return this.toView(row);
    }
    return this.applyScan(row, workDir, paths);
  }

  /** Nạp sample Vite + React PTUD. */
  async createFromSampleViteReact(accountId: string): Promise<PlaygroundRunView> {
    const sampleDir = sampleViteReactProjectDir();
    try {
      await access(sampleDir);
    } catch {
      throw new BadRequestException(
        `không tìm thấy sample Vite: ${sampleDir} — giữ "sample project/PTUD"`,
      );
    }

    const row = this.emptyRow(accountId, 'vite-react');
    await this.runs.save(row);
    const workDir = await ensureWorkDir(row.id);
    const paths = await copyViteProjectIntoWorkDir(sampleDir, workDir);
    if (!paths.includes('package.json')) {
      row.status = 'failed';
      row.error = 'sample thiếu package.json';
      row.filePaths = paths;
      await this.runs.save(row);
      return this.toView(row);
    }
    return this.applyScan(row, workDir, paths);
  }

  /** Nạp sample Express CNM (DynamoDB/S3). */
  async createFromSampleExpress(accountId: string): Promise<PlaygroundRunView> {
    const sampleDir = sampleExpressProjectDir();
    try {
      await access(sampleDir);
    } catch {
      throw new BadRequestException(
        `không tìm thấy sample Express: ${sampleDir} — giữ "sample project/CNM"`,
      );
    }

    const row = this.emptyRow(accountId, 'express');
    await this.runs.save(row);
    const workDir = await ensureWorkDir(row.id);
    const paths = await copyExpressProjectIntoWorkDir(sampleDir, workDir);
    if (!paths.includes('package.json') || !pickExpressEntry(paths)) {
      row.status = 'failed';
      row.error = 'sample thiếu package.json hoặc app.js/server.js';
      row.filePaths = paths;
      await this.runs.save(row);
      return this.toView(row);
    }
    return this.applyScan(row, workDir, paths);
  }

  private async applyScan(
    row: PlaygroundRunEntity,
    _workDir: string,
    paths: string[],
  ): Promise<PlaygroundRunView> {
    row.filePaths = paths;

    if (row.language === 'spring-boot') {
      const pom = paths.find((p) => p === 'pom.xml' || p.endsWith('/pom.xml'));
      if (!pom) {
        row.status = 'failed';
        row.entryPath = null;
        row.error = 'không tìm thấy pom.xml — đây không phải project Maven/Spring Boot';
      } else {
        row.entryPath = pom;
        row.entryDetection = 'auto';
        row.candidates = [pom];
        row.status = 'created';
      }
      await this.runs.save(row);
      return this.toView(row);
    }

    if (row.language === 'vite-react') {
      const pkg = paths.find((p) => p === 'package.json' || p.endsWith('/package.json'));
      if (!pkg) {
        row.status = 'failed';
        row.entryPath = null;
        row.error = 'không tìm thấy package.json — đây không phải project Vite/React';
      } else {
        row.entryPath = pkg;
        row.entryDetection = 'auto';
        row.candidates = [pkg];
        row.status = 'created';
      }
      await this.runs.save(row);
      return this.toView(row);
    }

    if (row.language === 'express') {
      const entry = pickExpressEntry(paths);
      const pkg = paths.find((p) => p === 'package.json' || p.endsWith('/package.json'));
      if (!pkg || !entry) {
        row.status = 'failed';
        row.entryPath = null;
        row.error =
          'thiếu package.json hoặc app.js/server.js/index.js — không phải Express app';
      } else {
        row.entryPath = entry;
        row.entryDetection = 'auto';
        row.candidates = [entry];
        row.status = 'created';
      }
      await this.runs.save(row);
      return this.toView(row);
    }

    if (row.language === 'static') {
      const scan = scanHtmlEntry(paths);
      row.entryDetection = scan.detection;
      row.candidates = scan.candidates;
      row.entryPath = scan.entryPath;
      if (scan.detection === 'pending') {
        row.status = 'needs_entry';
        if (scan.candidates.length === 0) {
          row.status = 'failed';
          row.error = 'không tìm thấy file .html';
        }
      } else {
        row.status = 'created';
      }
      await this.runs.save(row);
      return this.toView(row);
    }

    const sources = await loadSourceFiles(_workDir, paths);
    const scan = scanEntry(row.language as ConsoleLanguage, sources);
    row.entryDetection = scan.detection;
    row.candidates = scan.candidates;
    row.entryPath = scan.entryPath;

    if (scan.detection === 'pending') {
      row.status = 'needs_entry';
      if (scan.candidates.length === 0) {
        row.status = 'failed';
        row.error = 'không tìm thấy file điểm vào (main) cho ngôn ngữ đã chọn';
      }
    } else {
      row.status = 'created';
    }

    await this.runs.save(row);
    return this.toView(row);
  }

  async getForOwner(id: string, accountId: string): Promise<PlaygroundRunView> {
    const row = await this.runs.findOne({ where: { id } });
    if (!row) throw new NotFoundException('không tìm thấy lượt chạy');
    if (row.createdByAccountId !== accountId) throw new ForbiddenException();
    await this.expireIfNeeded(row);
    return this.toView(row);
  }

  private async stopPreviewContainer(row: PlaygroundRunEntity): Promise<void> {
    if (!row.containerName) return;
    if (row.language === 'spring-boot') {
      await stopSpringBootPreview(row.containerName);
    } else if (row.language === 'vite-react') {
      await stopVitePreview(row.containerName);
    } else if (row.language === 'express') {
      await stopExpressPreview(row.containerName);
    } else {
      await stopStaticPreview(row.containerName);
    }
  }

  private async expireIfNeeded(row: PlaygroundRunEntity): Promise<void> {
    if (
      (row.language === 'static' ||
        row.language === 'spring-boot' ||
        row.language === 'vite-react' ||
        row.language === 'express') &&
      row.status === 'running' &&
      row.expiresAt &&
      row.expiresAt.getTime() < Date.now()
    ) {
      await this.stopPreviewContainer(row);
      row.status = 'finished';
      row.finishedAt = new Date();
      row.error = 'preview hết hạn';
      row.containerName = null;
      await this.runs.save(row);
    }
  }

  async execute(
    id: string,
    accountId: string,
    entryPath?: string,
  ): Promise<PlaygroundRunView> {
    const row = await this.runs.findOne({ where: { id } });
    if (!row) throw new NotFoundException('không tìm thấy lượt chạy');
    if (row.createdByAccountId !== accountId) throw new ForbiddenException();

    if (row.status === 'queued' || row.status === 'running') {
      return this.toView(row);
    }

    if (entryPath) {
      if (!row.filePaths.includes(entryPath)) {
        throw new BadRequestException(`entryPath không thuộc run: ${entryPath}`);
      }
      row.entryPath = entryPath;
      row.entryDetection = 'manual';
    }

    if (
      !row.entryPath &&
      row.language !== 'spring-boot' &&
      row.language !== 'vite-react' &&
      row.language !== 'express'
    ) {
      throw new BadRequestException('chưa có file entry — chọn candidates rồi gửi entryPath');
    }
    if (row.language === 'spring-boot' && !row.entryPath) {
      row.entryPath = 'pom.xml';
    }
    if (row.language === 'vite-react' && !row.entryPath) {
      row.entryPath = 'package.json';
    }
    if (row.language === 'express' && !row.entryPath) {
      row.entryPath = 'app.js';
    }

    row.status = 'queued';
    row.error = null;
    row.compileLog = null;
    row.stdout = null;
    row.stderr = null;
    row.exitCode = null;
    row.finishedAt = null;
    row.previewUrl = null;
    row.containerName = null;
    row.hostPort = null;
    row.expiresAt = null;
    await this.runs.save(row);

    const longBuild =
      row.language === 'spring-boot' ||
      row.language === 'vite-react' ||
      row.language === 'express';
    await this.queue.add(
      'execute',
      { runId: row.id },
      {
        ...PLAYGROUND_JOB_OPTIONS,
        // Build dài — không retry để tránh chồng npm/Maven.
        attempts: longBuild ? 1 : PLAYGROUND_JOB_OPTIONS.attempts,
        jobId: `playground-${row.id}-${Date.now()}`,
      },
    );

    return this.toView(row);
  }

  async stop(id: string, accountId: string): Promise<PlaygroundRunView> {
    const row = await this.runs.findOne({ where: { id } });
    if (!row) throw new NotFoundException('không tìm thấy lượt chạy');
    if (row.createdByAccountId !== accountId) throw new ForbiddenException();
    await this.stopPreviewContainer(row);
    row.status = 'finished';
    row.finishedAt = new Date();
    row.containerName = null;
    row.error = row.error ?? 'đã dừng preview';
    await this.runs.save(row);
    return this.toView(row);
  }

  async processRun(runId: string): Promise<void> {
    const row = await this.runs.findOne({ where: { id: runId } });
    if (!row || !row.entryPath) return;

    row.status = 'running';
    row.startedAt = new Date();
    await this.runs.save(row);

    const workDir = await ensureWorkDir(row.id);

    if (row.language === 'static') {
      try {
        const preview = await startStaticPreview({
          workDir,
          entryPath: row.entryPath,
        });
        row.containerName = preview.containerName;
        row.hostPort = preview.hostPort;
        row.previewUrl = preview.previewUrl;
        row.expiresAt = new Date(Date.now() + PLAYGROUND_STATIC_TTL_MS);
        row.error = null;
        row.status = 'running';
        await this.runs.save(row);
      } catch (e) {
        row.status = 'failed';
        row.error = e instanceof Error ? e.message : String(e);
        row.finishedAt = new Date();
        await this.runs.save(row);
      }
      return;
    }

    if (row.language === 'spring-boot') {
      try {
        const preview = await startSpringBootPreview({
          workDir,
          runId: row.id,
        });
        row.containerName = preview.composeProject;
        row.hostPort = preview.hostPort;
        row.previewUrl = preview.previewUrl;
        row.expiresAt = new Date(Date.now() + PLAYGROUND_SPRING_TTL_MS);
        row.error = null;
        row.status = 'running';
        await this.runs.save(row);
      } catch (e) {
        row.status = 'failed';
        row.error = e instanceof Error ? e.message : String(e);
        row.finishedAt = new Date();
        await this.runs.save(row);
      }
      return;
    }

    if (row.language === 'vite-react') {
      try {
        const preview = await startVitePreview({
          workDir,
          runId: row.id,
        });
        row.containerName = preview.containerName;
        row.hostPort = preview.hostPort;
        row.previewUrl = preview.previewUrl;
        row.expiresAt = new Date(Date.now() + PLAYGROUND_VITE_TTL_MS);
        row.error = null;
        row.status = 'running';
        await this.runs.save(row);
      } catch (e) {
        row.status = 'failed';
        row.error = e instanceof Error ? e.message : String(e);
        row.finishedAt = new Date();
        await this.runs.save(row);
      }
      return;
    }

    if (row.language === 'express') {
      try {
        const preview = await startExpressPreview({
          workDir,
          runId: row.id,
          entryFile: row.entryPath ?? 'app.js',
        });
        row.containerName = preview.containerName;
        row.hostPort = preview.hostPort;
        row.previewUrl = preview.previewUrl;
        row.expiresAt = new Date(Date.now() + PLAYGROUND_EXPRESS_TTL_MS);
        row.error = null;
        row.status = 'running';
        await this.runs.save(row);
      } catch (e) {
        row.status = 'failed';
        row.error = e instanceof Error ? e.message : String(e);
        row.finishedAt = new Date();
        await this.runs.save(row);
      }
      return;
    }

    const result = await runConsoleInDocker({
      workDir,
      language: row.language as ConsoleLanguage,
      entryPath: row.entryPath,
    });

    row.compileLog = result.compileLog;
    row.stdout = result.stdout;
    row.stderr = result.stderr;
    row.exitCode = result.exitCode;
    row.error = result.error;
    row.finishedAt = new Date();
    row.status = result.error ? 'failed' : 'finished';
    await this.runs.save(row);
  }

  async markFailed(runId: string, message: string): Promise<void> {
    const row = await this.runs.findOne({ where: { id: runId } });
    if (!row) return;
    if (row.status === 'finished' || row.status === 'failed') return;
    await this.stopPreviewContainer(row).catch(() => undefined);
    row.status = 'failed';
    row.error = message;
    row.finishedAt = new Date();
    row.containerName = null;
    await this.runs.save(row);
  }
}
