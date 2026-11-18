import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import JSZip from 'jszip';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { IDE_EXTENSION_KEY_PREFIX } from '../../storage/storage.types';
import { IdeExtensionVersionEntity } from '../entities/ide-extension-version.entity';
import { IdeExtensionsService } from '../ide-extensions.service';
import {
  JPLAG_DEMO_EXT_BY_LANGUAGE,
  JPLAG_DEMO_MAX_ARCHIVE_BYTES,
  JPLAG_DEMO_MAX_FILE_BYTES,
  JPLAG_DEMO_MAX_FILES,
  type JplagDemoLanguage,
  type JplagDemoRunProfile,
  isJplagDemoLanguage,
} from './jplag.constants';
import type { JplagParsedComparison } from './jplag-report-parse';
import {
  type JplagCompareFile,
  JplagRunnerService,
  sanitizeRelativePath,
} from './jplag-runner.service';

export type JplagDemoUpload = {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype?: string;
};

export type JplagRunView = {
  profile: JplagDemoRunProfile;
  cliLanguage: string;
  similarity: number;
  firstSubmission: string | null;
  secondSubmission: string | null;
  extensionFileCount: number;
  compareFileCount: number;
  reportUrl: string | null;
  reportFilename: string | null;
  viewCommandHint: string | null;
  comparison: {
    files: JplagParsedComparison['files'];
    matches: JplagParsedComparison['matches'];
  } | null;
};

export type JplagDemoResult = {
  language: JplagDemoLanguage;
  runs: JplagRunView[];
  reportExpiresIn: number | null;
  message: string;
};

@Injectable()
export class IdeExtensionJplagDemoService {
  constructor(
    private readonly ideExtensions: IdeExtensionsService,
    private readonly storage: StorageService,
    private readonly jplagRunner: JplagRunnerService,
    @InjectRepository(IdeExtensionVersionEntity)
    private readonly versions: Repository<IdeExtensionVersionEntity>,
  ) {}

  async runDemo(
    versionId: string,
    languageRaw: string,
    uploads: { archive?: JplagDemoUpload | null; files?: JplagDemoUpload[] },
  ): Promise<JplagDemoResult> {
    if (!isJplagDemoLanguage(languageRaw)) {
      throw new BadRequestException(
        `Ngôn ngữ không hỗ trợ: ${languageRaw}. Dùng: javascript, typescript, cpp, python3, java.`,
      );
    }
    const language = languageRaw;

    await this.jplagRunner.assertRuntime();

    const version = await this.versions.findOne({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản.');

    const normalized = await this.ideExtensions.getNormalizedSources(versionId);
    if (normalized.mode === 'none' || normalized.items.length === 0) {
      throw new BadRequestException(
        'Không có snippet đã chuẩn hóa để so sánh. Extension cần contributes.snippets.',
      );
    }

    const compareFiles = await this.collectCompareFiles(uploads, language);
    if (compareFiles.length === 0) {
      throw new BadRequestException(
        'Không có file mã nguồn hợp lệ trong ZIP/folder upload (đúng đuôi ngôn ngữ đã chọn).',
      );
    }

    const dual = await this.jplagRunner.runDualComparison({
      language,
      extensionItems: normalized.items,
      compareFiles,
    });

    const runs: JplagRunView[] = [];
    let reportExpiresIn: number | null = null;

    for (const run of dual.runs) {
      const runId = randomUUID();
      const reportFilename = `jplag-demo-${versionId.slice(0, 8)}-${run.profile}.jplag`;
      const reportKey = [
        IDE_EXTENSION_KEY_PREFIX,
        version.extensionPk,
        version.id,
        'jplag-demo',
        `${runId}.jplag`,
      ].join('/');
      await this.storage.putObject(reportKey, run.reportBuffer, 'application/octet-stream');
      const { downloadUrl, expiresIn } = await this.storage.generateDownloadUrl(reportKey, {
        filename: reportFilename,
      });
      if (expiresIn != null) reportExpiresIn = expiresIn;

      runs.push({
        profile: run.profile,
        cliLanguage: run.cliLanguage,
        similarity: run.similarity,
        firstSubmission: run.firstSubmission,
        secondSubmission: run.secondSubmission,
        extensionFileCount: run.extensionFileCount,
        compareFileCount: run.compareFileCount,
        reportUrl: downloadUrl,
        reportFilename,
        viewCommandHint: `java --enable-native-access=ALL-UNNAMED -jar apps/api/tools/jplag/jplag.jar --mode VIEW ${reportFilename}`,
        comparison: run.comparison,
      });
    }

    const textSim = runs.find((r) => r.profile === 'text')?.similarity ?? 0;
    const langSim = runs.find((r) => r.profile === 'language')?.similarity ?? 0;
    return {
      language,
      runs,
      reportExpiresIn,
      message: `JPlag dual demo xong — text ${(textSim * 100).toFixed(1)}% / language ${(langSim * 100).toFixed(1)}%.`,
    };
  }

  private async collectCompareFiles(
    uploads: { archive?: JplagDemoUpload | null; files?: JplagDemoUpload[] },
    language: JplagDemoLanguage,
  ): Promise<JplagCompareFile[]> {
    const allowed = new Set(JPLAG_DEMO_EXT_BY_LANGUAGE[language]);
    const out: JplagCompareFile[] = [];

    if (uploads.archive) {
      if (uploads.archive.size > JPLAG_DEMO_MAX_ARCHIVE_BYTES) {
        throw new BadRequestException(
          `ZIP quá lớn (trần ${JPLAG_DEMO_MAX_ARCHIVE_BYTES} byte).`,
        );
      }
      const zip = await JSZip.loadAsync(uploads.archive.buffer);
      for (const name of Object.keys(zip.files)) {
        if (out.length >= JPLAG_DEMO_MAX_FILES) break;
        const entry = zip.files[name];
        if (!entry || entry.dir) continue;
        const rel = sanitizeRelativePath(name);
        if (!rel) continue;
        const lower = rel.toLowerCase();
        if (![...allowed].some((e) => lower.endsWith(e))) continue;
        const data = await entry.async('nodebuffer');
        if (data.length > JPLAG_DEMO_MAX_FILE_BYTES) continue;
        out.push({ path: rel, content: data.toString('utf8') });
      }
    }

    for (const file of uploads.files ?? []) {
      if (out.length >= JPLAG_DEMO_MAX_FILES) break;
      if (file.size > JPLAG_DEMO_MAX_FILE_BYTES) continue;
      const rel = sanitizeRelativePath(file.originalname);
      if (!rel) continue;
      const lower = rel.toLowerCase();
      if (![...allowed].some((e) => lower.endsWith(e))) continue;
      out.push({ path: rel, content: file.buffer.toString('utf8') });
    }

    return out;
  }
}
