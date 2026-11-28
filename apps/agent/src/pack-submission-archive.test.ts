import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import JSZip from 'jszip';
import {
  collectPackFiles,
  IGNORED_DIRECTORIES,
  PACK_MAX_FILE_BYTES,
} from './snapshot';
import { packSubmissionArchives } from './pack-submission-archive';
import { MATERIALS_DIRNAME, INSTRUCTIONS_FILENAME } from './exam-materials';

function tmpWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'examcollect-pack-'));
}

function write(root: string, relative: string, content: string): void {
  const full = path.join(root, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('collectPackFiles', () => {
  it('lấy source + pom, bỏ node_modules/target/.gradle', () => {
    const root = tmpWorkspace();
    write(root, 'pom.xml', '<project/>');
    write(root, 'src/main/java/Main.java', 'class Main {}');
    write(root, 'node_modules/left-pad/index.js', 'x');
    write(root, 'target/classes/Main.class', 'x');
    write(root, '.gradle/caches/x', 'x');

    const result = collectPackFiles(root, { excludeRootNames: new Set() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.map((f) => f.relativePath).sort()).toEqual([
      'pom.xml',
      'src/main/java/Main.java',
    ]);
  });

  it('bỏ deliverable khác ở root và không whitelist đuôi (giữ Dockerfile)', () => {
    const root = tmpWorkspace();
    write(root, 'BaiThi.zip', 'placeholder');
    write(root, 'BaoCao.docx', 'doc');
    write(root, 'Dockerfile', 'FROM java');
    write(root, 'src/App.java', 'class App {}');

    const result = collectPackFiles(root, {
      excludeRootNames: new Set(['BaiThi.zip', 'BaoCao.docx']),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.files.map((f) => f.relativePath).sort()).toEqual([
      'Dockerfile',
      'src/App.java',
    ]);
  });

  it('fail khi một file vượt trần pack', () => {
    const root = tmpWorkspace();
    write(root, 'huge.bin', 'x'.repeat(PACK_MAX_FILE_BYTES + 1));

    const result = collectPackFiles(root, { excludeRootNames: new Set() });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/quá lớn/i);
  });

  it('IGNORED_DIRECTORIES gồm Java/Spring extras', () => {
    for (const name of ['.gradle', 'out', 'bin', 'classes', 'coverage']) {
      expect(IGNORED_DIRECTORIES.has(name)).toBe(true);
    }
  });
});

describe('packSubmissionArchives', () => {
  it('đóng .zip từ workspace, bỏ ignore và de-thi', async () => {
    const root = tmpWorkspace();
    write(root, 'BaiThi.zip', 'old');
    write(root, 'package.json', '{"name":"app"}');
    write(root, 'src/index.js', 'console.log(1)');
    write(root, 'node_modules/x/index.js', 'dep');
    write(root, `${MATERIALS_DIRNAME}/de.pdf`, 'de');
    write(root, INSTRUCTIONS_FILENAME, 'huong dan');

    const result = await packSubmissionArchives(root, [
      { requiredFilename: 'BaiThi.zip' },
    ]);

    expect(result.failed).toEqual([]);
    expect(result.packed).toEqual(['BaiThi.zip']);

    const zip = await JSZip.loadAsync(fs.readFileSync(path.join(root, 'BaiThi.zip')));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    expect(names).toEqual(['package.json', 'src/index.js']);
  });

  it('không đụng deliverable không phải archive', async () => {
    const root = tmpWorkspace();
    write(root, 'Cau1.docx', 'doc');

    const result = await packSubmissionArchives(root, [
      { requiredFilename: 'Cau1.docx' },
    ]);
    expect(result.packed).toEqual([]);
    expect(result.failed).toEqual([]);
    expect(fs.readFileSync(path.join(root, 'Cau1.docx'), 'utf8')).toBe('doc');
  });

  it('.rar thiếu WinRAR → failed rõ ràng', async () => {
    const root = tmpWorkspace();
    write(root, 'src/Main.java', 'class Main {}');

    const result = await packSubmissionArchives(
      root,
      [{ requiredFilename: 'BaiThi.rar' }],
      { findRar: () => null },
    );

    expect(result.packed).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.filename).toBe('BaiThi.rar');
    expect(result.failed[0]!.reason).toMatch(/winrar/i);
  });

  it('.rar dùng packRar inject khi có findRar giả', async () => {
    const root = tmpWorkspace();
    write(root, 'src/Main.java', 'class Main {}');
    const calls: string[] = [];

    const result = await packSubmissionArchives(
      root,
      [{ requiredFilename: 'BaiThi.rar' }],
      {
        findRar: () => 'C:\\fake\\Rar.exe',
        packRar: async ({ destPath, files }) => {
          calls.push(destPath);
          fs.writeFileSync(destPath, `rar:${files.map((f) => f.relativePath).join(',')}`);
        },
      },
    );

    expect(result.packed).toEqual(['BaiThi.rar']);
    expect(result.failed).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, 'BaiThi.rar'), 'utf8')).toBe(
      'rar:src/Main.java',
    );
  });

  it('workspace trống (chỉ ignore) → failed', async () => {
    const root = tmpWorkspace();
    write(root, 'node_modules/x/a.js', 'x');

    const result = await packSubmissionArchives(root, [
      { requiredFilename: 'BaiThi.zip' },
    ]);
    expect(result.packed).toEqual([]);
    expect(result.failed[0]!.reason).toMatch(/không có file/i);
  });
});
