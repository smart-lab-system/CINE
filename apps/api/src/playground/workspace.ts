import { existsSync } from 'node:fs';
import { cp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import * as yauzl from 'yauzl';
import {
  PLAYGROUND_MAX_BYTES,
  PLAYGROUND_MAX_FILES,
  PLAYGROUND_SOURCE_MAX_CHARS,
} from './playground.constants';
import type { SourceFile } from './entry-scanner';

const TEXT_EXT = new Set([
  '.c',
  '.h',
  '.cpp',
  '.cc',
  '.cxx',
  '.hpp',
  '.java',
  '.py',
  '.txt',
  '.md',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.xml',
]);

const STATIC_ASSET_EXT = new Set([
  ...TEXT_EXT,
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.map',
]);

/** Spring Boot / Maven source tree. */
const SPRING_EXT = new Set([
  ...STATIC_ASSET_EXT,
  '.java',
  '.xml',
  '.properties',
  '.yml',
  '.yaml',
  '.sql',
  '.gradle',
  '.kts',
]);

/** Vite / React (JSX/TSX) source tree. */
const VITE_EXT = new Set([
  ...STATIC_ASSET_EXT,
  '.jsx',
  '.tsx',
  '.ts',
  '.mjs',
  '.cjs',
  '.vue',
  '.scss',
  '.sass',
  '.less',
  '.lock',
]);

/** Express + EJS / views. */
const EXPRESS_EXT = new Set([
  ...VITE_EXT,
  '.ejs',
  '.hbs',
  '.pug',
  '.njk',
  '.env',
]);

export function playgroundRoot(): string {
  return process.env.PLAYGROUND_DATA_DIR ?? join(tmpdir(), 'cine-playground');
}

export function runWorkDir(runId: string): string {
  return join(playgroundRoot(), runId);
}

export function normalizeRelPath(raw: string): string | null {
  const n = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!n || n.includes('\0') || n.split('/').some((p) => p === '..' || p === '')) {
    return null;
  }
  // Bỏ segment thư mục gốc trùng khi zip có 1 folder bọc
  return n;
}

export async function ensureWorkDir(runId: string): Promise<string> {
  const dir = runWorkDir(runId);
  await mkdir(dir, { recursive: true });
  return dir;
}

function extOf(path: string): string {
  const i = path.lastIndexOf('.');
  return i < 0 ? '' : path.slice(i).toLowerCase();
}

export async function writeFiles(
  workDir: string,
  files: { path: string; content: string | Buffer }[],
  opts?: { binaryOk?: boolean },
): Promise<string[]> {
  if (files.length > PLAYGROUND_MAX_FILES) {
    throw new Error(`quá nhiều file (tối đa ${PLAYGROUND_MAX_FILES})`);
  }
  const paths: string[] = [];
  let totalBytes = 0;
  for (const f of files) {
    const rel = normalizeRelPath(f.path);
    if (!rel) throw new Error(`đường dẫn không hợp lệ: ${f.path}`);
    const abs = join(workDir, ...rel.split('/'));
    if (!abs.startsWith(workDir)) throw new Error(`đường dẫn thoát workspace: ${f.path}`);
    const buf = typeof f.content === 'string' ? Buffer.from(f.content, 'utf8') : f.content;
    totalBytes += buf.length;
    if (totalBytes > PLAYGROUND_MAX_BYTES) {
      throw new Error(`tổng dung lượng vượt ${PLAYGROUND_MAX_BYTES} bytes`);
    }
    if (!opts?.binaryOk && buf.length > PLAYGROUND_SOURCE_MAX_CHARS) {
      throw new Error(`file text quá lớn: ${rel}`);
    }
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, buf);
    paths.push(rel);
  }
  return paths;
}

export async function loadSourceFiles(workDir: string, filePaths: string[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const p of filePaths) {
    if (!TEXT_EXT.has(extOf(p))) continue;
    const abs = join(workDir, ...p.split('/'));
    const content = await readFile(abs, 'utf8');
    out.push({ path: p, content });
  }
  return out;
}

function allowInZip(
  path: string,
  opts: {
    staticMode?: boolean;
    springMode?: boolean;
    viteMode?: boolean;
    expressMode?: boolean;
  },
): boolean {
  const ext = extOf(path);
  const base = path.split('/').pop()?.toLowerCase() ?? '';
  if (opts.viteMode || opts.expressMode) {
    if (base === 'package.json' || base === 'package-lock.json' || base === 'pnpm-lock.yaml') {
      return true;
    }
    if (/(^|\/)(node_modules|dist|\.git)(\/|$)/i.test(path)) return false;
    if (opts.expressMode) {
      return (
        EXPRESS_EXT.has(ext) ||
        base === 'app.js' ||
        base === 'server.js' ||
        base.startsWith('eslint.config')
      );
    }
    return VITE_EXT.has(ext) || base.startsWith('vite.config') || base.startsWith('eslint.config');
  }
  if (opts.springMode) return SPRING_EXT.has(ext) || path.endsWith('pom.xml');
  if (opts.staticMode) return STATIC_ASSET_EXT.has(ext);
  return TEXT_EXT.has(ext);
}

/** Giải nén zip an toàn vào workDir. */
export function extractZipToWorkDir(
  buffer: Buffer,
  workDir: string,
  opts?: {
    staticMode?: boolean;
    springMode?: boolean;
    viteMode?: boolean;
    expressMode?: boolean;
  },
): Promise<string[]> {
  const staticMode = opts?.staticMode ?? false;
  const springMode = opts?.springMode ?? false;
  const viteMode = opts?.viteMode ?? false;
  const expressMode = opts?.expressMode ?? false;
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipfile) => {
        if (openError || !zipfile) {
          reject(new Error(openError?.message ?? 'không mở được zip'));
          return;
        }

        const paths: string[] = [];
        let totalUncompressed = 0;
        const MAX_UNCOMPRESSED = PLAYGROUND_MAX_BYTES;

        zipfile.readEntry();
        zipfile.on('entry', (entry: yauzl.Entry) => {
          const rel = normalizeRelPath(entry.fileName);
          if (!rel || /\/$/.test(entry.fileName)) {
            zipfile.readEntry();
            return;
          }
          if (paths.length >= PLAYGROUND_MAX_FILES) {
            zipfile.close();
            reject(new Error(`zip có quá ${PLAYGROUND_MAX_FILES} file`));
            return;
          }
          totalUncompressed += entry.uncompressedSize;
          if (totalUncompressed > MAX_UNCOMPRESSED) {
            zipfile.close();
            reject(new Error('zip bung ra quá lớn'));
            return;
          }
          if (!allowInZip(rel, { staticMode, springMode, viteMode, expressMode })) {
            zipfile.readEntry();
            return;
          }
          zipfile.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              zipfile.close();
              reject(err ?? new Error('không đọc entry'));
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on('data', (c: Buffer) => {
              size += c.length;
              if (size > 5 * 1024 * 1024) {
                stream.destroy();
                zipfile.close();
                reject(new Error(`file trong zip quá lớn: ${rel}`));
                return;
              }
              chunks.push(c);
            });
            stream.on('error', (e) => {
              zipfile.close();
              reject(e);
            });
            stream.on('end', () => {
              void (async () => {
                try {
                  await writeFiles(
                    workDir,
                    [{ path: rel, content: Buffer.concat(chunks) }],
                    { binaryOk: staticMode || springMode || viteMode || expressMode },
                  );
                  paths.push(rel);
                  zipfile.readEntry();
                } catch (e) {
                  zipfile.close();
                  reject(e);
                }
              })();
            });
          });
        });
        zipfile.on('end', () => resolve(paths));
        zipfile.on('error', reject);
      },
    );
  });
}

/** Copy cây thư mục sample (web tĩnh) vào workDir — giữ html/css/js/img. */
export async function copyTreeIntoWorkDir(srcDir: string, workDir: string): Promise<string[]> {
  // Copy từng con để tránh Nest/Node đôi khi gộp lệch trên Windows.
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const e of entries) {
    await cp(join(srcDir, e.name), join(workDir, e.name), { recursive: true });
  }
  return listRelFiles(workDir);
}

/** Copy Spring Boot sample: chỉ pom.xml + src/ (bỏ target/, .idea/). */
export async function copySpringProjectIntoWorkDir(
  srcDir: string,
  workDir: string,
): Promise<string[]> {
  await cp(join(srcDir, 'pom.xml'), join(workDir, 'pom.xml'));
  await cp(join(srcDir, 'src'), join(workDir, 'src'), { recursive: true });
  return listRelFiles(workDir);
}

const VITE_COPY_NAMES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'vite.config.js',
  'vite.config.ts',
  'vite.config.mjs',
  'index.html',
  'eslint.config.js',
  'eslint.config.mjs',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'src',
  'public',
];

/** Copy Vite/React sample — bỏ node_modules/, dist/. */
export async function copyViteProjectIntoWorkDir(
  srcDir: string,
  workDir: string,
): Promise<string[]> {
  for (const name of VITE_COPY_NAMES) {
    const from = join(srcDir, name);
    if (!existsSync(from)) continue;
    await cp(from, join(workDir, name), { recursive: true });
  }
  return listRelFiles(workDir);
}

/**
 * Nếu mọi path đều dưới một thư mục gốc duy nhất (`M18_.../html/...`),
 * bỏ prefix đó để `../css` từ `html/index.html` trỏ đúng `/css/...`.
 */
export function stripSingleRootDir(paths: string[]): {
  paths: string[];
  stripped: boolean;
  rootPrefix: string | null;
} {
  if (paths.length === 0) return { paths, stripped: false, rootPrefix: null };
  const first = paths[0]!.split('/')[0];
  if (!first || !paths.every((p) => p === first || p.startsWith(`${first}/`))) {
    return { paths, stripped: false, rootPrefix: null };
  }
  // Chỉ strip nếu còn path sâu hơn (không phải mọi file nằm ngay dưới root)
  const deeper = paths.some((p) => p.includes('/'));
  if (!deeper) return { paths, stripped: false, rootPrefix: null };
  // Không strip nếu root đã là cấu trúc project (web tĩnh / Maven)
  if (
    [
      'html',
      'css',
      'js',
      'img',
      'src',
      'public',
      'views',
      'config',
      'controller',
      'service',
      'pom.xml',
      'package.json',
      'app.js',
    ].includes(first.toLowerCase())
  ) {
    return { paths, stripped: false, rootPrefix: null };
  }
  return {
    paths: paths.map((p) => (p === first ? '' : p.slice(first.length + 1))).filter(Boolean),
    stripped: true,
    rootPrefix: first,
  };
}

/** Đổi tên thư mục gốc trong workspace sau khi strip prefix. */
export async function remapWorkDirStripRoot(workDir: string, rootPrefix: string): Promise<void> {
  const nested = join(workDir, rootPrefix);
  const entries = await readdir(nested, { withFileTypes: true });
  for (const e of entries) {
    await cp(join(nested, e.name), join(workDir, e.name), { recursive: true });
  }
  await rm(nested, { recursive: true, force: true });
}

export function conventionName(language: string): string {
  switch (language) {
    case 'c':
      return 'main.c';
    case 'cpp':
      return 'main.cpp';
    case 'java':
      return 'Main.java';
    case 'python':
      return 'main.py';
    case 'static':
      return 'index.html';
    default:
      return 'main.txt';
  }
}

export async function listRelFiles(dir: string, base = dir): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await listRelFiles(abs, base)));
    } else {
      out.push(relative(base, abs).split(sep).join('/'));
    }
  }
  return out;
}

function resolveSampleDir(folderName: string, envKey?: string): string {
  if (envKey && process.env[envKey]) return process.env[envKey]!;
  const candidates = [
    join(process.cwd(), '..', '..', 'sample project', folderName),
    join(process.cwd(), 'sample project', folderName),
    join(__dirname, '..', '..', '..', '..', 'sample project', folderName),
    join(__dirname, '..', '..', '..', '..', '..', 'sample project', folderName),
  ];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

/** Sample web tĩnh. */
export function sampleStaticProjectDir(): string {
  return resolveSampleDir('M18_NguyenThanhHuy_22699781', 'PLAYGROUND_SAMPLE_STATIC_DIR');
}

/** Sample Spring Boot + Thymeleaf + MariaDB. */
export function sampleSpringBootProjectDir(): string {
  return resolveSampleDir(
    '22681861_NguyenGiaBao_Shopping',
    'PLAYGROUND_SAMPLE_SPRING_DIR',
  );
}

/** Sample Vite + React (PTUD). */
export function sampleViteReactProjectDir(): string {
  return resolveSampleDir('PTUD', 'PLAYGROUND_SAMPLE_VITE_DIR');
}

const EXPRESS_COPY_NAMES = [
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'app.js',
  'server.js',
  'index.js',
  'eslint.config.js',
  'eslint.config.mjs',
  'config',
  'controller',
  'controllers',
  'service',
  'services',
  'routes',
  'views',
  'public',
  'middleware',
  'utils',
  'lib',
];

/** Copy Express sample — bỏ node_modules; không copy .env (playground tự ghi). */
export async function copyExpressProjectIntoWorkDir(
  srcDir: string,
  workDir: string,
): Promise<string[]> {
  for (const name of EXPRESS_COPY_NAMES) {
    const from = join(srcDir, name);
    if (!existsSync(from)) continue;
    await cp(from, join(workDir, name), { recursive: true });
  }
  return listRelFiles(workDir);
}

/** Sample Express + EJS + AWS (CNM). */
export function sampleExpressProjectDir(): string {
  return resolveSampleDir('CNM', 'PLAYGROUND_SAMPLE_EXPRESS_DIR');
}

/** Chọn file entry Express từ danh sách path. */
export function pickExpressEntry(paths: string[]): string | null {
  const norm = paths.map((p) => p.replace(/\\/g, '/'));
  for (const candidate of ['app.js', 'server.js', 'index.js']) {
    if (norm.includes(candidate)) return candidate;
  }
  const nested = norm.find((p) => /(^|\/)(app|server|index)\.js$/i.test(p));
  return nested ?? null;
}
