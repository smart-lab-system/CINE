import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { NormalizedSourceItem } from '../normalize/snippet-normalize';
import {
  type JplagDemoLanguage,
  type JplagDemoProfile,
  type JplagDemoRunProfile,
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

export type JplagCompareFile = {
  path: string;
  content: string;
};

export type JplagRunnerRunResult = {
  profile: JplagDemoRunProfile;
  cliLanguage: string;
  similarity: number;
  firstSubmission: string | null;
  secondSubmission: string | null;
  extensionFileCount: number;
  compareFileCount: number;
  reportBuffer: Buffer;
  comparison: {
    files: JplagParsedComparison['files'];
    matches: JplagParsedComparison['matches'];
  } | null;
};

export type JplagDualComparisonResult = {
  language: JplagDemoLanguage;
  runs: JplagRunnerRunResult[];
};

export type JplagDualComparisonInput = {
  language: JplagDemoLanguage;
  extensionItems: NormalizedSourceItem[];
  compareFiles: JplagCompareFile[];
  /** Defaults to `['text', 'swc']`. */
  profiles?: JplagDemoProfile[];
};

@Injectable()
export class JplagRunnerService {
  private readonly logger = new Logger(JplagRunnerService.name);

  async assertRuntime(): Promise<{ javaBin: string; jarPath: string }> {
    const jarPath = resolveJplagJarPath();
    const javaBin = resolveJplagJavaBin();
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
    return { javaBin, jarPath };
  }

  /**
   * Stage both sides, run dual profiles (text + language), parse each `.jplag`.
   * Caller owns Storage upload / DB persist.
   */
  async runDualComparison(
    input: JplagDualComparisonInput,
  ): Promise<JplagDualComparisonResult> {
    const { language, extensionItems, compareFiles } = input;
    const profiles = input.profiles ?? (['text', 'swc'] as JplagDemoProfile[]);
    const { javaBin, jarPath } = await this.assertRuntime();

    if (extensionItems.length === 0) {
      throw new BadRequestException('Không có snippet extension để so sánh.');
    }
    if (compareFiles.length === 0) {
      throw new BadRequestException('Không có file compare để so sánh.');
    }

    const runs: JplagRunnerRunResult[] = [];
    for (const profile of profiles) {
      const workRoot = await fs.mkdtemp(path.join(os.tmpdir(), `cine-jplag-${profile}-`));
      try {
        runs.push(
          await this.runSingleProfile({
            workRoot,
            javaBin,
            jarPath,
            language,
            profile,
            extensionItems,
            compareFiles,
          }),
        );
      } finally {
        await fs.rm(workRoot, { recursive: true, force: true }).catch((err) => {
          this.logger.warn(
            `Không xóa workdir JPlag: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }
    }

    return { language, runs };
  }

  private async runSingleProfile(opts: {
    workRoot: string;
    javaBin: string;
    jarPath: string;
    language: JplagDemoLanguage;
    profile: JplagDemoProfile;
    extensionItems: NormalizedSourceItem[];
    compareFiles: JplagCompareFile[];
  }): Promise<JplagRunnerRunResult> {
    const {
      workRoot,
      javaBin,
      jarPath,
      language,
      profile,
      extensionItems,
      compareFiles,
    } = opts;

    const submissions = path.join(workRoot, 'submissions');
    const extensionDir = path.join(submissions, 'extension');
    const compareDir = path.join(submissions, 'compare');
    await fs.mkdir(extensionDir, { recursive: true });
    await fs.mkdir(compareDir, { recursive: true });

    const extensionFileCount = await this.writeExtensionSide(
      extensionDir,
      extensionItems,
      language,
      profile,
    );
    if (extensionFileCount === 0) {
      throw new BadRequestException(
        `Không có snippet nào ghi được cho ngôn ngữ ${language} (profile ${profile}).`,
      );
    }

    const compareFileCount = await this.writeCompareFiles(
      compareDir,
      compareFiles,
      language,
      profile,
    );
    if (compareFileCount === 0) {
      throw new BadRequestException(
        `Không có file compare hợp lệ cho ngôn ngữ ${language} (profile ${profile}).`,
      );
    }

    await this.runJplag(javaBin, jarPath, language, profile, workRoot);

    const reportPath = path.join(workRoot, 'out.jplag');
    const reportBuffer = await fs.readFile(reportPath);
    let comparison: JplagParsedComparison;
    try {
      comparison = await parseJplagReportBuffer(reportBuffer);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Không parse được report JPlag.',
      );
    }

    return {
      profile: toRunProfile(profile),
      cliLanguage: jplagCliLanguage(language, profile),
      similarity: comparison.similarity,
      firstSubmission: comparison.firstSubmission,
      secondSubmission: comparison.secondSubmission,
      extensionFileCount,
      compareFileCount,
      reportBuffer,
      comparison: {
        files: comparison.files,
        matches: comparison.matches,
      },
    };
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

  private async writeCompareFiles(
    dir: string,
    files: JplagCompareFile[],
    language: JplagDemoLanguage,
    profile: JplagDemoProfile,
  ): Promise<number> {
    let count = 0;
    for (const file of files) {
      const rel = sanitizeRelativePath(file.path);
      if (!rel) continue;
      const staged = stageCompareRelativePath(rel, language, profile);
      const dest = path.join(dir, ...staged.split('/'));
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(
        dest,
        prepareSourceForJplag(file.content, language, profile, staged),
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
    this.logger.log(`JPlag (cwd=${workRoot}): ${javaBin} ${args.join(' ')}`);
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

export function mapContributeLanguage(raw: string): JplagDemoLanguage | null {
  const v = raw.toLowerCase();
  if (v === 'javascript' || v === 'js' || v === 'jsx') return 'javascript';
  if (v === 'typescript' || v === 'ts' || v === 'tsx') return 'typescript';
  if (v === 'cpp' || v === 'c++' || v === 'c') return 'cpp';
  if (v === 'python' || v === 'python3' || v === 'py') return 'python3';
  if (v === 'java') return 'java';
  return null;
}

/** SWC when profile=swc + JS/TS; otherwise passthrough. */
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

/** Remap .jsx→.js only for SWC profile. */
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
export function sanitizeRelativePath(entryName: string): string | null {
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

/** @deprecated Use sanitizeRelativePath */
export const sanitizeUploadRelativePath = sanitizeRelativePath;
