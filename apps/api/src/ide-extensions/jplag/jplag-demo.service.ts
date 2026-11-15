import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import JSZip from 'jszip';
import { Repository } from 'typeorm';
import { StorageService } from '../../storage/storage.service';
import { IDE_EXTENSION_KEY_PREFIX } from '../../storage/storage.types';
import { IdeExtensionVersionEntity } from '../entities/ide-extension-version.entity';
import { IdeExtensionsService } from '../ide-extensions.service';
import type { NormalizedSourceItem } from '../normalize/snippet-normalize';
import {
  JPLAG_DEMO_EXT_BY_LANGUAGE,
  JPLAG_DEMO_MAX_ARCHIVE_BYTES,
  JPLAG_DEMO_MAX_FILE_BYTES,
  JPLAG_DEMO_MAX_FILES,
  type JplagDemoLanguage,
  type JplagDemoProfile,
  type JplagDemoRunProfile,
  isJplagDemoLanguage,
  jplagCliLanguage,
  jplagCliSuffixes,
  jplagDemoDefaultExt,
  resolveJplagJarPath,
  resolveJplagJavaBin,
  resolveJplagMinTokens,
  resolveJplagTimeoutMs,
  toRunProfile,
} from './jplag.constants';
import {
  type JplagParsedComparison,
  parseJplagReportBuffer,
} from './jplag-report-parse';
import { transformSourceForJplag } from './swc-transform-for-jplag';

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
  private readonly logger = new Logger(IdeExtensionJplagDemoService.name);

  constructor(
    private readonly ideExtensions: IdeExtensionsService,
    private readonly storage: StorageService,
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

    const jarPath = resolveJplagJarPath();
    const javaBin = resolveJplagJavaBin();
    await this.assertRuntime(javaBin, jarPath);

    const version = await this.versions.findOne({ where: { id: versionId } });
    if (!version) throw new NotFoundException('Không tìm thấy phiên bản.');

    const normalized = await this.ideExtensions.getNormalizedSources(versionId);
    if (normalized.mode === 'none' || normalized.items.length === 0) {
      throw new BadRequestException(
        'Không có snippet đã chuẩn hóa để so sánh. Extension cần contributes.snippets.',
      );
    }

    const profiles: JplagDemoProfile[] = ['text', 'swc'];
    const runs: JplagRunView[] = [];
    let reportExpiresIn: number | null = null;

    for (const profile of profiles) {
      const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), `cine-jplag-${profile}-`));
      try {
        const run = await this.runSingleProfile({
          workRoot,
          javaBin,
          jarPath,
          language,
          profile,
          items: normalized.items,
          uploads,
          version,
          versionId,
        });
        runs.push(run.view);
        if (run.expiresIn != null) reportExpiresIn = run.expiresIn;
      } finally {
        await fs.rm(workRoot, { recursive: true, force: true }).catch((err) => {
          this.logger.warn(
            `Không xóa workdir JPlag: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
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

  private async runSingleProfile(opts: {
    workRoot: string;
    javaBin: string;
    jarPath: string;
    language: JplagDemoLanguage;
    profile: JplagDemoProfile;
    items: NormalizedSourceItem[];
    uploads: { archive?: JplagDemoUpload | null; files?: JplagDemoUpload[] };
    version: IdeExtensionVersionEntity;
    versionId: string;
  }): Promise<{ view: JplagRunView; expiresIn: number | null }> {
    const {
      workRoot,
      javaBin,
      jarPath,
      language,
      profile,
      items,
      uploads,
      version,
      versionId,
    } = opts;

    const submissions = path.join(workRoot, 'submissions');
    const extensionDir = path.join(submissions, 'extension');
    const compareDir = path.join(submissions, 'compare');
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.mkdir(compareDir, { recursive: true });

    const extensionFileCount = await this.writeExtensionSide(
      extensionDir,
      items,
      language,
      profile,
    );
    if (extensionFileCount === 0) {
      throw new BadRequestException(
        `Không có snippet nào ghi được cho ngôn ngữ ${language} (profile ${profile}).`,
      );
    }

    const compareFileCount = await this.writeCompareSide(
      compareDir,
      uploads,
      language,
      profile,
    );
    if (compareFileCount === 0) {
      throw new BadRequestException(
        'Không có file mã nguồn hợp lệ trong ZIP/folder upload (đúng đuôi ngôn ngữ đã chọn).',
      );
    }

    await this.runJplag(javaBin, jarPath, language, profile, workRoot);

    const reportPath = path.join(workRoot, 'out.jplag');
    const reportBuf = await fs.readFile(reportPath);
    let comparison: JplagParsedComparison;
    try {
      comparison = await parseJplagReportBuffer(reportBuf);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Không parse được report JPlag.',
      );
    }

    const runId = randomUUID();
    const runProfile = toRunProfile(profile);
    const reportFilename = `jplag-demo-${versionId.slice(0, 8)}-${runProfile}.jplag`;
    const reportKey = [
      IDE_EXTENSION_KEY_PREFIX,
      version.extensionPk,
      version.id,
      'jplag-demo',
      `${runId}.jplag`,
    ].join('/');
    await this.storage.putObject(reportKey, reportBuf, 'application/octet-stream');
    const { downloadUrl, expiresIn } = await this.storage.generateDownloadUrl(reportKey, {
      filename: reportFilename,
    });

    const cliLanguage = jplagCliLanguage(language, profile);
    return {
      expiresIn,
      view: {
        profile: runProfile,
        cliLanguage,
        similarity: comparison.similarity,
        firstSubmission: comparison.firstSubmission,
        secondSubmission: comparison.secondSubmission,
        extensionFileCount,
        compareFileCount,
        reportUrl: downloadUrl,
        reportFilename,
        viewCommandHint: `java --enable-native-access=ALL-UNNAMED -jar apps/api/tools/jplag/jplag.jar --mode VIEW ${reportFilename}`,
        comparison: {
          files: comparison.files,
          matches: comparison.matches,
        },
      },
    };
  }

  private async assertRuntime(javaBin: string, jarPath: string): Promise<void> {
    try {
      await fs.access(jarPath);
    } catch {
      throw new ServiceUnavailableException(
        `Không tìm thấy JPlag JAR tại ${jarPath}. Đặt JPLAG_JAR_PATH (xem .env.example).`,
      );
    }
    try {
      await this.execCapture(javaBin, ['-version'], 10_000);
    } catch (error) {
      throw new ServiceUnavailableException(
        `Không chạy được Java (${javaBin}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async writeExtensionSide(
    dir: string,
    items: NormalizedSourceItem[],
    language: JplagDemoLanguage,
    profile: JplagDemoProfile,
  ): Promise<number> {
    const ext = jplagDemoDefaultExt(language, profile);
    let count = 0;
    for (const item of items) {
      if (item.language) {
        const mapped = mapContributeLanguage(item.language);
        if (mapped && mapped !== language) continue;
      }
      const safe = item.id.replace(/[^A-Za-z0-9._-]+/g, '-') || `snippet-${count}`;
      const body = prepareSourceForJplag(item.content, language, profile, `${safe}${ext}`);
      await fs.writeFile(path.join(dir, `${safe}${ext}`), body, 'utf8');
      count += 1;
    }
    return count;
  }

  private async writeCompareSide(
    dir: string,
    uploads: { archive?: JplagDemoUpload | null; files?: JplagDemoUpload[] },
    language: JplagDemoLanguage,
    profile: JplagDemoProfile,
  ): Promise<number> {
    let count = 0;
    const allowed = new Set(JPLAG_DEMO_EXT_BY_LANGUAGE[language]);

    if (uploads.archive) {
      if (uploads.archive.size > JPLAG_DEMO_MAX_ARCHIVE_BYTES) {
        throw new BadRequestException(
          `ZIP quá lớn (trần ${JPLAG_DEMO_MAX_ARCHIVE_BYTES} byte).`,
        );
      }
      count += await this.extractZipToCompare(
        dir,
        uploads.archive.buffer,
        allowed,
        language,
        profile,
      );
    }

    for (const file of uploads.files ?? []) {
      if (count >= JPLAG_DEMO_MAX_FILES) break;
      if (file.size > JPLAG_DEMO_MAX_FILE_BYTES) continue;
      const rel = sanitizeUploadRelativePath(file.originalname);
      if (!rel) continue;
      const lower = rel.toLowerCase();
      if (![...allowed].some((e) => lower.endsWith(e))) continue;
      const staged = stageCompareRelativePath(rel, language, profile);
      const dest = path.join(dir, ...staged.split('/'));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      const text = file.buffer.toString('utf8');
      await fs.writeFile(
        dest,
        prepareSourceForJplag(text, language, profile, staged),
        'utf8',
      );
      count += 1;
    }

    return count;
  }

  private async extractZipToCompare(
    dir: string,
    buffer: Buffer,
    allowed: Set<string>,
    language: JplagDemoLanguage,
    profile: JplagDemoProfile,
  ): Promise<number> {
    const zip = await JSZip.loadAsync(buffer);
    let count = 0;
    const entries = Object.keys(zip.files);
    for (const name of entries) {
      if (count >= JPLAG_DEMO_MAX_FILES) break;
      const entry = zip.files[name];
      if (!entry || entry.dir) continue;
      const rel = sanitizeUploadRelativePath(name);
      if (!rel) continue;
      const lower = rel.toLowerCase();
      if (![...allowed].some((e) => lower.endsWith(e))) continue;
      const data = await entry.async('nodebuffer');
      if (data.length > JPLAG_DEMO_MAX_FILE_BYTES) continue;
      const staged = stageCompareRelativePath(rel, language, profile);
      const dest = path.join(dir, ...staged.split('/'));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(
        dest,
        prepareSourceForJplag(data.toString('utf8'), language, profile, staged),
        'utf8',
      );
      count += 1;
    }
    return count;
  }

  private async runJplag(
    javaBin: string,
    jarPath: string,
    language: JplagDemoLanguage,
    profile: JplagDemoProfile,
    workRoot: string,
  ): Promise<void> {
    const cliLang = jplagCliLanguage(language, profile);
    const suffixes = jplagCliSuffixes(language, profile);
    const minTokens = resolveJplagMinTokens();
    const jarAbs = path.resolve(jarPath);
    const args = [
      '--enable-native-access=ALL-UNNAMED',
      '-jar',
      jarAbs,
      '--mode',
      'RUN',
      '--skip-version-check',
      '-l',
      cliLang,
      '-t',
      String(minTokens),
      '-r',
      'out',
    ];
    if (suffixes) {
      args.push('-p', suffixes);
    }
    args.push('submissions');

    const timeout = resolveJplagTimeoutMs();
    this.logger.log(`JPlag demo (cwd=${workRoot}): ${javaBin} ${args.join(' ')}`);
    const { code, stderr, stdout } = await this.execCapture(javaBin, args, timeout, workRoot);
    const reportPath = path.join(workRoot, 'out.jplag');
    const reportExists = await fs
      .access(reportPath)
      .then(() => true)
      .catch(() => false);

    if (reportExists && !/different root|Unexpected end of JSON/i.test(`${stderr}\n${stdout}`)) {
      return;
    }
    if (reportExists) {
      this.logger.warn(
        `JPlag wrote report with warnings (exit ${code}); continuing if JSON is intact.`,
      );
      return;
    }

    const combined = `${stderr}\n${stdout}`;
    const errorLines = combined
      .split(/\r?\n/)
      .filter((line) => /\[ERROR\]/i.test(line) || /Not enough valid/i.test(line))
      .join('\n')
      .slice(0, 1500);
    throw new BadRequestException(
      `JPlag thất bại (${profile}, exit ${code}): ${
        errorLines || combined.slice(0, 1500) || 'không tạo được report'
      }`,
    );
  }

  private execCapture(
    command: string,
    args: string[],
    timeoutMs: number,
    cwd?: string,
  ): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { windowsHide: true, cwd });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Timeout sau ${timeoutMs}ms`));
      }, timeoutMs);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
    });
  }
}

function mapContributeLanguage(raw: string): JplagDemoLanguage | null {
  const v = raw.toLowerCase();
  if (v === 'javascript' || v === 'js' || v === 'jsx') return 'javascript';
  if (v === 'typescript' || v === 'ts' || v === 'tsx') return 'typescript';
  if (v === 'cpp' || v === 'c++' || v === 'c') return 'cpp';
  if (v === 'python' || v === 'python3' || v === 'py') return 'python3';
  if (v === 'java') return 'java';
  return null;
}

/** SWC when profile=swc + JS/TS; otherwise passthrough (text profile keeps JSX). */
export function prepareSourceForJplag(
  content: string,
  language: JplagDemoLanguage,
  profile: JplagDemoProfile,
  filenameHint?: string,
): string {
  if (profile !== 'swc' || (language !== 'javascript' && language !== 'typescript')) {
    return content;
  }
  try {
    return transformSourceForJplag(content, language, filenameHint);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new BadRequestException(
      `SWC không transform được ${filenameHint ?? 'source'} (${language}): ${msg.slice(0, 500)}`,
    );
  }
}

/** Remap .jsx→.js only for SWC profile; text keeps original suffixes. */
export function stageCompareRelativePath(
  rel: string,
  language: JplagDemoLanguage,
  profile: JplagDemoProfile,
): string {
  if (profile !== 'swc') return rel;
  if (language === 'javascript') {
    return rel.replace(/\.(jsx|mjs|cjs)$/i, '.js');
  }
  if (language === 'typescript') {
    return rel.replace(/\.tsx$/i, '.ts');
  }
  return rel;
}

/** Reject Zip Slip / absolute paths; return POSIX relative path or null. */
export function sanitizeUploadRelativePath(entryName: string): string | null {
  if (!entryName || entryName.includes('\0')) return null;
  const p = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!p || p.endsWith('/')) return null;
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null;
  const parts = p.split('/');
  const safe: string[] = [];
  for (const segment of parts) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return null;
    safe.push(segment);
  }
  if (safe.length === 0) return null;
  return safe.join('/');
}
