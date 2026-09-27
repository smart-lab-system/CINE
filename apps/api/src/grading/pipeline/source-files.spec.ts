import * as yazl from 'yazl';
import { sourceFilesOf } from './source-files';

/** Dựng một zip trong bộ nhớ (khuôn `archive-reader.spec.ts`). */
function makeZip(files: Record<string, string | Buffer>): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const [name, content] of Object.entries(files)) zip.addBuffer(Buffer.isBuffer(content) ? content : Buffer.from(content), name);
  zip.end();
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
}

/**
 * Zip mà header KHAI một kích thước nhỏ nhưng dữ liệu thật lớn hơn — header nói dối được, nên
 * phải đếm byte thật lúc đọc. Sửa trường "uncompressed size" (offset 22 của local header, và 24
 * của central directory) của một zip hợp lệ.
 */
async function lyingZip(name: string, realBytes: number, claimed: number): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  // Nén (deflate): bom thật trông thế này — vài KB nén, header khai nhỏ, bung ra rất lớn.
  zip.addBuffer(Buffer.alloc(realBytes, 0x61), name, { compress: true });
  zip.end();
  const buf: Buffer = await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
  const central = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  buf.writeUInt32LE(claimed, central + 24);
  return buf;
}

const SRC = 'int main(){return 0;}\n';

describe('sourceFilesOf — byte bài nộp thành file mã nguồn (§2.1, §4.4)', () => {
  it('file lẻ C++ → main.cpp, không entry', async () => {
    expect(await sourceFilesOf(Buffer.from(SRC), 'Bai1.cpp', 'cpp')).toEqual({
      kind: 'ok',
      files: [{ path: 'main.cpp', content: SRC }],
      entry: null,
      dropped: [],
    });
  });

  it('file lẻ Python → main.py là file chạy; BOM bị bỏ', async () => {
    const out = await sourceFilesOf(Buffer.from('﻿print(1)\n'), '{MSSV}_bai.py', 'python');
    expect(out).toEqual({ kind: 'ok', files: [{ path: 'main.py', content: 'print(1)\n' }], entry: 'main.py', dropped: [] });
  });

  it('zip: giữ mã nguồn của ngôn ngữ, bỏ README, __MACOSX, file ẩn — và nói ra đã bỏ gì', async () => {
    const zip = await makeZip({
      'bai/main.cpp': SRC,
      'bai/list.h': '#pragma once\n',
      'bai/README.md': 'x',
      '__MACOSX/bai/._main.cpp': 'x',
      'bai/.hidden.cpp': SRC,
    });
    const out = await sourceFilesOf(zip, 'bai.zip', 'cpp');
    expect(out).toMatchObject({ kind: 'ok', entry: null });
    if (out.kind !== 'ok') throw new Error('unreachable');
    expect(out.files.map((f) => f.path)).toEqual(['bai/list.h', 'bai/main.cpp']);
    expect(out.dropped.sort()).toEqual(['__MACOSX/bai/._main.cpp', 'bai/.hidden.cpp', 'bai/README.md']);
  });

  it('zip có đường dẫn thoát thư mục → submission', async () => {
    const zip = await makeZip({ 'ok.cpp': SRC });
    // yazl không cho đặt tên "../" — sửa tên trong byte: độ dài tên giữ nguyên.
    const bad = Buffer.from(zip.toString('latin1').split('ok.cpp').join('../a.c'), 'latin1');
    const out = await sourceFilesOf(bad, 'bai.zip', 'cpp');
    expect(out).toMatchObject({ kind: 'ungradable', class: 'submission' });
  });

  it('header khai 100 byte, dữ liệu thật 2 MiB → submission, không đọc hết vào bộ nhớ', async () => {
    const out = await sourceFilesOf(await lyingZip('main.cpp', 2 * 1024 * 1024, 100), 'bai.zip', 'cpp');
    expect(out).toMatchObject({ kind: 'ungradable', class: 'submission', reason: expect.stringMatching(/vượt/) });
  });

  it('file KHÔNG phải mã nguồn vượt trần (dữ liệu 2 MiB) chỉ bị bỏ; file MÃ NGUỒN vượt trần thì từ chối cả bài', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024, 0x61);
    expect(await sourceFilesOf(await makeZip({ 'main.cpp': SRC, 'data.bin': big }), 'bai.zip', 'cpp')).toMatchObject({
      kind: 'ok',
      files: [{ path: 'main.cpp' }],
      dropped: ['data.bin'],
    });
    expect(await sourceFilesOf(await makeZip({ 'main.cpp': big }), 'bai.zip', 'cpp')).toMatchObject({
      kind: 'ungradable',
      class: 'submission',
      reason: expect.stringMatching(/vượt/),
    });
  });

  it('zip không có file mã nguồn nào → submission', async () => {
    const out = await sourceFilesOf(await makeZip({ 'README.md': 'x' }), 'bai.zip', 'cpp');
    expect(out).toMatchObject({ kind: 'ungradable', class: 'submission', reason: expect.stringMatching(/mã nguồn/) });
  });

  it('Python: không main.py nhưng một file .py duy nhất → nó là file chạy; hai file thì submission', async () => {
    expect(await sourceFilesOf(await makeZip({ 'bai.py': 'print(1)\n' }), 'bai.zip', 'python')).toMatchObject({ kind: 'ok', entry: 'bai.py' });
    expect(await sourceFilesOf(await makeZip({ 'a.py': 'x\n', 'b.py': 'y\n' }), 'bai.zip', 'python')).toMatchObject({
      kind: 'ungradable',
      class: 'submission',
      reason: expect.stringMatching(/main\.py/),
    });
  });

  it('RAR → submission (đường điều tra chỉ đọc ZIP)', async () => {
    const rar = Buffer.concat([Buffer.from('Rar!\x1a\x07\x00', 'latin1'), Buffer.alloc(32)]);
    expect(await sourceFilesOf(rar, 'bai.rar', 'cpp')).toMatchObject({ kind: 'ungradable', class: 'submission', reason: expect.stringMatching(/RAR/) });
  });

  it('tên file không qua được khuôn của sandbox (dấu cách) đi qua NGUYÊN VẸN — programProblem() của cuộc điều tra phán nó', async () => {
    const out = await sourceFilesOf(await makeZip({ 'bai lam.cpp': SRC }), 'bai.zip', 'cpp');
    expect(out).toMatchObject({ kind: 'ok', files: [{ path: 'bai lam.cpp', content: SRC }] });
  });

  it('file nhị phân (có byte NUL) bị bỏ, không gửi sang sandbox', async () => {
    const out = await sourceFilesOf(await makeZip({ 'main.cpp': SRC, 'x.cpp': Buffer.from([0x41, 0x00, 0x42]) }), 'bai.zip', 'cpp');
    expect(out).toMatchObject({ kind: 'ok', dropped: ['x.cpp'] });
  });
});
