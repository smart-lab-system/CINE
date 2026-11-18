import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import JSZip from 'jszip';
import { In, Repository } from 'typeorm';
import type { DeclaredLanguage } from '../../exam-session/declared-language';
import { RequiredDeliverableEntity } from '../../exam-session/entities/required-deliverable.entity';
import { GradingReferenceService } from '../../grading/grading-reference.service';
import { sourceFilesOf } from '../../grading/pipeline/source-files';
import { StorageService } from '../../storage/storage.service';
import { IDE_EXTENSION_KEY_PREFIX } from '../../storage/storage.types';
import { SubmissionEntity } from '../../submission/entities/submission.entity';
import { IdeExtensionEntity } from '../entities/ide-extension.entity';
import {
  IdeExtensionJplagRunEntity,
  type IdeExtensionJplagRunTrigger,
} from '../entities/ide-extension-jplag-run.entity';
import { IdeExtensionVersionEntity } from '../entities/ide-extension-version.entity';
import { IdeExtensionsService } from '../ide-extensions.service';
import {
  JPLAG_DEMO_EXT_BY_LANGUAGE,
  type JplagDemoLanguage,
  isJplagDemoLanguage,
} from './jplag.constants';
import {
  IDE_EXTENSION_JPLAG_JOB_OPTIONS,
  IDE_EXTENSION_JPLAG_QUEUE,
  type JplagExamVsModelJob,
  type JplagExamVsStudentJob,
} from './jplag-exam.constants';
import {
  type JplagCompareFile,
  JplagRunnerService,
  sanitizeRelativePath,
} from './jplag-runner.service';

export type BlockedScanHint = {
  extensionId: string;
  version: string | null;
  studentMssv?: string | null;
};

@Injectable()
export class JplagExamService {
  private readonly logger = new Logger(JplagExamService.name);

  constructor(
    private readonly ideExtensions: IdeExtensionsService,
    private readonly jplagRunner: JplagRunnerService,
    private readonly storage: StorageService,
    private readonly gradingReference: GradingReferenceService,
    @InjectQueue(IDE_EXTENSION_JPLAG_QUEUE)
    private readonly jplagQueue: Queue<JplagExamVsModelJob | JplagExamVsStudentJob>,
    @InjectRepository(IdeExtensionJplagRunEntity)
    private readonly runs: Repository<IdeExtensionJplagRunEntity>,
    @InjectRepository(IdeExtensionEntity)
    private readonly extensions: Repository<IdeExtensionEntity>,
    @InjectRepository(IdeExtensionVersionEntity)
    private readonly versions: Repository<IdeExtensionVersionEntity>,
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
  ) {}

  /** After scans/batch: enqueue vs_model for each distinct blocked extension (with version). */
  async enqueueFromBlockedScans(
    examSessionId: string | null | undefined,
    blocked: BlockedScanHint[],
    trigger: IdeExtensionJplagRunTrigger = 'scan',
  ): Promise<void> {
    if (!examSessionId || blocked.length === 0) return;

    const seen = new Set<string>();
    for (const b of blocked) {
      if (!b.version) continue;
      const key = `${b.extensionId}@${b.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await this.enqueueVsModel({
          examSessionId,
          extensionIdentifier: b.extensionId,
          extensionVersion: b.version,
          trigger,
        });
      } catch (error) {
        this.logger.warn(
          `enqueue vs_model ${key} session=${examSessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /** After submission confirm: if student has blocked extensions, enqueue vs_student. */
  async enqueueFromSubmission(opts: {
    examSessionId: string;
    studentMssv: string;
    submissionId: string;
    requiredDeliverableId: string;
  }): Promise<void> {
    const blocked = await this.findBlockedExtensionsForStudent(
      opts.examSessionId,
      opts.studentMssv,
    );
    for (const b of blocked) {
      if (!b.version) continue;
      try {
        await this.enqueueVsStudent({
          ...opts,
          extensionIdentifier: b.extensionId,
          extensionVersion: b.version,
          trigger: 'submission',
        });
      } catch (error) {
        this.logger.warn(
          `enqueue vs_student ${b.extensionId}@${b.version} mssv=${opts.studentMssv}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async enqueueVsModel(opts: {
    examSessionId: string;
    extensionIdentifier: string;
    extensionVersion: string;
    trigger: IdeExtensionJplagRunTrigger;
  }): Promise<IdeExtensionJplagRunEntity> {
    const resolved = await this.resolveCatalogVersion(
      opts.extensionIdentifier,
      opts.extensionVersion,
    );

    if (resolved?.versionId) {
      const existing = await this.runs.findOne({
        where: {
          examSessionId: opts.examSessionId,
          versionId: resolved.versionId,
          kind: 'vs_model',
          status: In(['pending', 'running', 'completed']),
        },
      });
      if (existing) {
        if (existing.status === 'completed' && opts.trigger === 'manual') {
          existing.status = 'failed';
          existing.error = 'superseded by manual retry';
          await this.runs.save(existing);
        } else {
          return existing;
        }
      }
    }

    const language = await this.resolveSessionLanguage(opts.examSessionId);
    const run = await this.runs.save(
      this.runs.create({
        examSessionId: opts.examSessionId,
        extensionPk: resolved?.extensionPk ?? null,
        versionId: resolved?.versionId ?? null,
        extensionIdentifier: opts.extensionIdentifier,
        extensionVersion: opts.extensionVersion,
        kind: 'vs_model',
        status: 'pending',
        trigger: opts.trigger,
        language,
      }),
    );

    await this.jplagQueue.add(
      'vs-model',
      { runId: run.id },
      { ...IDE_EXTENSION_JPLAG_JOB_OPTIONS, jobId: `jplag-vs-model-${run.id}` },
    );
    return run;
  }

  async enqueueVsStudent(opts: {
    examSessionId: string;
    studentMssv: string;
    submissionId: string;
    requiredDeliverableId: string;
    extensionIdentifier: string;
    extensionVersion: string;
    trigger: IdeExtensionJplagRunTrigger;
  }): Promise<IdeExtensionJplagRunEntity> {
    const resolved = await this.resolveCatalogVersion(
      opts.extensionIdentifier,
      opts.extensionVersion,
    );

    if (resolved?.versionId) {
      const existing = await this.runs.findOne({
        where: {
          examSessionId: opts.examSessionId,
          versionId: resolved.versionId,
          studentMssv: opts.studentMssv,
          requiredDeliverableId: opts.requiredDeliverableId,
          kind: 'vs_student',
          status: In(['pending', 'running', 'completed']),
        },
      });
      if (existing) {
        if (existing.status === 'completed' && opts.trigger === 'manual') {
          existing.status = 'failed';
          existing.error = 'superseded by manual retry';
          await this.runs.save(existing);
        } else {
          return existing;
        }
      }
    }

    const deliverable = await this.deliverables.findOne({
      where: { id: opts.requiredDeliverableId },
    });
    const language = mapDeclaredToJplag(deliverable?.language ?? null);

    const run = await this.runs.save(
      this.runs.create({
        examSessionId: opts.examSessionId,
        extensionPk: resolved?.extensionPk ?? null,
        versionId: resolved?.versionId ?? null,
        extensionIdentifier: opts.extensionIdentifier,
        extensionVersion: opts.extensionVersion,
        kind: 'vs_student',
        status: 'pending',
        trigger: opts.trigger,
        language,
        studentMssv: opts.studentMssv,
        requiredDeliverableId: opts.requiredDeliverableId,
        submissionId: opts.submissionId,
      }),
    );

    await this.jplagQueue.add(
      'vs-student',
      { runId: run.id },
      { ...IDE_EXTENSION_JPLAG_JOB_OPTIONS, jobId: `jplag-vs-student-${run.id}` },
    );
    return run;
  }

  async processVsModel(runId: string): Promise<void> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run || run.kind !== 'vs_model') return;
    if (run.status === 'completed') return;

    run.status = 'running';
    run.error = null;
    await this.runs.save(run);

    try {
      if (!run.versionId) {
        throw new BadRequestException(
          `Chưa có bản VSIX trong catalog cho ${run.extensionIdentifier}@${run.extensionVersion}.`,
        );
      }
      const language = requireJplagLanguage(run.language);
      const normalized = await this.ideExtensions.getNormalizedSources(run.versionId);
      if (normalized.mode === 'none' || normalized.items.length === 0) {
        throw new BadRequestException('Extension không có snippet đã chuẩn hóa.');
      }

      const source = await this.gradingReference.getAnswerSource(run.examSessionId);
      if (!source?.key) {
        throw new BadRequestException(
          'Chưa có mã đáp án mẫu (model_answer_source_key) cho phiên này.',
        );
      }
      const bytes = await this.storage.getObject(source.key);
      const content = bytes.toString('utf8');
      const path = guessSourcePath(source.key, language);

      const dual = await this.jplagRunner.runDualComparison({
        language,
        extensionItems: normalized.items,
        compareFiles: [{ path, content }],
      });
      await this.persistDualResult(run, dual.runs);
    } catch (error) {
      run.status = 'failed';
      run.error = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
      await this.runs.save(run);
      this.logger.warn(`vs_model run ${runId} failed: ${run.error}`);
    }
  }

  async processVsStudent(runId: string): Promise<void> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run || run.kind !== 'vs_student') return;
    if (run.status === 'completed') return;

    run.status = 'running';
    run.error = null;
    await this.runs.save(run);

    try {
      if (!run.versionId) {
        throw new BadRequestException(
          `Chưa có bản VSIX trong catalog cho ${run.extensionIdentifier}@${run.extensionVersion}.`,
        );
      }
      if (!run.submissionId) {
        throw new BadRequestException('Thiếu submissionId.');
      }
      const language = requireJplagLanguage(run.language);
      const normalized = await this.ideExtensions.getNormalizedSources(run.versionId);
      if (normalized.mode === 'none' || normalized.items.length === 0) {
        throw new BadRequestException('Extension không có snippet đã chuẩn hóa.');
      }

      const submission = await this.submissions.findOne({ where: { id: run.submissionId } });
      if (!submission?.storageKey) {
        throw new BadRequestException('Không tìm thấy bài nộp.');
      }
      const bytes = await this.storage.getObject(submission.storageKey);
      const compareFiles = await this.loadSubmissionCompareFiles(
        bytes,
        submission.storageKey.split('/').pop() ?? 'submission.zip',
        language,
      );
      if (compareFiles.length === 0) {
        throw new BadRequestException('Bài nộp không có file mã nguồn phù hợp ngôn ngữ.');
      }

      const dual = await this.jplagRunner.runDualComparison({
        language,
        extensionItems: normalized.items,
        compareFiles,
      });
      await this.persistDualResult(run, dual.runs);
    } catch (error) {
      run.status = 'failed';
      run.error = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
      await this.runs.save(run);
      this.logger.warn(`vs_student run ${runId} failed: ${run.error}`);
    }
  }

  async listRuns(examSessionId: string): Promise<IdeExtensionJplagRunEntity[]> {
    return this.runs.find({
      where: { examSessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async getRun(runId: string): Promise<IdeExtensionJplagRunEntity> {
    const run = await this.runs.findOne({ where: { id: runId } });
    if (!run) throw new NotFoundException('Không tìm thấy JPlag run.');
    return run;
  }

  async getRunComparison(
    runId: string,
    profile: 'text' | 'language',
  ): Promise<{
    run: IdeExtensionJplagRunEntity;
    profile: 'text' | 'language';
    cliLanguage: string;
    similarity: number;
    firstSubmission: string | null;
    secondSubmission: string | null;
    comparison: {
      files: Array<{ id: string; path: string; content: string }>;
      matches: unknown[];
    } | null;
    reportUrl: string | null;
  }> {
    const run = await this.getRun(runId);
    const key = profile === 'text' ? run.comparisonTextKey : run.comparisonLanguageKey;
    const reportKey = profile === 'text' ? run.reportTextKey : run.reportLanguageKey;
    if (!key) {
      throw new BadRequestException(`Chưa có comparison cho profile ${profile}.`);
    }
    const buf = await this.storage.getObject(key);
    const stored = JSON.parse(buf.toString('utf8')) as {
      files?: Array<{ id: string; path: string; content: string }>;
      matches?: unknown[];
      firstSubmission?: string | null;
      secondSubmission?: string | null;
      similarity?: number;
      cliLanguage?: string;
      profile?: string;
    };
    let reportUrl: string | null = null;
    if (reportKey) {
      const { downloadUrl } = await this.storage.generateDownloadUrl(reportKey, {
        filename: `jplag-${run.kind}-${profile}.jplag`,
      });
      reportUrl = downloadUrl;
    }
    const similarity =
      typeof stored.similarity === 'number'
        ? stored.similarity
        : profile === 'text'
          ? (run.similarityText ?? 0)
          : (run.similarityLanguage ?? 0);
    return {
      run,
      profile,
      cliLanguage: stored.cliLanguage ?? run.language ?? profile,
      similarity,
      firstSubmission: stored.firstSubmission ?? null,
      secondSubmission: stored.secondSubmission ?? null,
      comparison:
        stored.files || stored.matches
          ? { files: stored.files ?? [], matches: stored.matches ?? [] }
          : null,
      reportUrl,
    };
  }

  async retryVsModel(examSessionId: string, runId: string): Promise<IdeExtensionJplagRunEntity> {
    const prev = await this.getRun(runId);
    if (prev.examSessionId !== examSessionId) {
      throw new NotFoundException('Không tìm thấy JPlag run.');
    }
    if (!prev.extensionVersion) {
      throw new BadRequestException('Run thiếu extension version.');
    }
    return this.enqueueVsModel({
      examSessionId,
      extensionIdentifier: prev.extensionIdentifier,
      extensionVersion: prev.extensionVersion,
      trigger: 'manual',
    });
  }

  private async persistDualResult(
    run: IdeExtensionJplagRunEntity,
    dualRuns: Awaited<ReturnType<JplagRunnerService['runDualComparison']>>['runs'],
  ): Promise<void> {
    const text = dualRuns.find((r) => r.profile === 'text');
    const language = dualRuns.find((r) => r.profile === 'language');
    const prefix = [
      IDE_EXTENSION_KEY_PREFIX,
      run.extensionPk ?? 'unknown',
      run.versionId ?? 'unknown',
      'jplag-exam',
      run.id,
    ].join('/');

    if (text) {
      run.similarityText = text.similarity;
      run.reportTextKey = `${prefix}/text.jplag`;
      run.comparisonTextKey = `${prefix}/text-comparison.json`;
      await this.storage.putObject(run.reportTextKey, text.reportBuffer, 'application/octet-stream');
      await this.storage.putObject(
        run.comparisonTextKey,
        Buffer.from(
          JSON.stringify({
            ...(text.comparison ?? { files: [], matches: [] }),
            firstSubmission: text.firstSubmission,
            secondSubmission: text.secondSubmission,
            similarity: text.similarity,
            cliLanguage: text.cliLanguage,
            profile: 'text',
          }),
          'utf8',
        ),
        'application/json',
      );
    }
    if (language) {
      run.similarityLanguage = language.similarity;
      run.reportLanguageKey = `${prefix}/language.jplag`;
      run.comparisonLanguageKey = `${prefix}/language-comparison.json`;
      await this.storage.putObject(
        run.reportLanguageKey,
        language.reportBuffer,
        'application/octet-stream',
      );
      await this.storage.putObject(
        run.comparisonLanguageKey,
        Buffer.from(
          JSON.stringify({
            ...(language.comparison ?? { files: [], matches: [] }),
            firstSubmission: language.firstSubmission,
            secondSubmission: language.secondSubmission,
            similarity: language.similarity,
            cliLanguage: language.cliLanguage,
            profile: 'language',
          }),
          'utf8',
        ),
        'application/json',
      );
    }

    run.status = 'completed';
    run.error = null;
    await this.runs.save(run);
  }

  private async resolveCatalogVersion(
    identifier: string,
    version: string,
  ): Promise<{ extensionPk: string; versionId: string } | null> {
    const ext = await this.extensions.findOne({ where: { identifier } });
    if (!ext) return null;
    const ver = await this.versions.findOne({
      where: { extensionPk: ext.id, version },
    });
    if (!ver) return null;
    return { extensionPk: ext.id, versionId: ver.id };
  }

  private async resolveSessionLanguage(examSessionId: string): Promise<string | null> {
    const rows = await this.deliverables.find({
      where: { examSessionId },
      order: { createdAt: 'ASC' },
    });
    const code = rows.find((d) => d.deliverableType === 'code_project' && d.language);
    return mapDeclaredToJplag(code?.language ?? null);
  }

  private async findBlockedExtensionsForStudent(
    examSessionId: string,
    studentMssv: string,
  ): Promise<BlockedScanHint[]> {
    const rows: Array<{ extension_id: string; version: string | null }> =
      await this.runs.manager.query(
        `
        SELECT DISTINCT i.extension_id, i.version
        FROM examcollect.ide_extension_scan_item i
        INNER JOIN examcollect.ide_extension_scan s ON s.id = i.scan_id
        WHERE s.exam_session_id = $1
          AND s.student_mssv = $2
          AND i.verdict = 'blocked'
        `,
        [examSessionId, studentMssv],
      );
    return rows.map((r) => ({
      extensionId: r.extension_id,
      version: r.version,
      studentMssv,
    }));
  }

  private async loadSubmissionCompareFiles(
    bytes: Buffer,
    filename: string,
    language: JplagDemoLanguage,
  ): Promise<JplagCompareFile[]> {
    if (language === 'cpp' || language === 'python3') {
      const extracted = await sourceFilesOf(
        bytes,
        filename,
        language === 'python3' ? 'python' : 'cpp',
      );
      if (extracted.kind !== 'ok') {
        throw new BadRequestException(extracted.reason);
      }
      return extracted.files;
    }

    // JS/TS/Java: unzip allowed suffixes (or treat as single text file).
    const allowed = JPLAG_DEMO_EXT_BY_LANGUAGE[language];
    try {
      const zip = await JSZip.loadAsync(bytes);
      const out: JplagCompareFile[] = [];
      for (const name of Object.keys(zip.files)) {
        const entry = zip.files[name];
        if (!entry || entry.dir) continue;
        const rel = sanitizeRelativePath(name);
        if (!rel) continue;
        const lower = rel.toLowerCase();
        if (!allowed.some((e) => lower.endsWith(e))) continue;
        out.push({ path: rel, content: await entry.async('string') });
      }
      if (out.length > 0) return out;
    } catch {
      // not a zip
    }
    return [{ path: guessSourcePath(filename, language), content: bytes.toString('utf8') }];
  }
}

export function mapDeclaredToJplag(
  lang: DeclaredLanguage | string | null,
): JplagDemoLanguage | null {
  if (!lang) return null;
  if (lang === 'python') return 'python3';
  if (lang === 'cpp') return 'cpp';
  if (lang === 'java') return 'java';
  if (lang === 'node') return 'javascript';
  if (isJplagDemoLanguage(lang)) return lang;
  return null;
}

function requireJplagLanguage(lang: string | null): JplagDemoLanguage {
  const mapped = mapDeclaredToJplag(lang);
  if (!mapped) {
    throw new BadRequestException(
      'Chưa xác định ngôn ngữ JPlag (cần required_deliverable.code_project.language).',
    );
  }
  return mapped;
}

function guessSourcePath(storageKey: string, language: JplagDemoLanguage): string {
  const base = storageKey.split('/').pop() ?? 'model';
  if (/\.(cpp|cc|cxx|h|hpp|py|java|js|jsx|ts|tsx)$/i.test(base)) return base;
  if (language === 'python3') return 'main.py';
  if (language === 'java') return 'Main.java';
  if (language === 'javascript' || language === 'typescript') return 'main.js';
  return 'main.cpp';
}

/** Stable short id for job keys (unused currently but handy). */
export function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}
