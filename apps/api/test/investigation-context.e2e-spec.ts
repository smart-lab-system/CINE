import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { InvestigationContextService } from '../src/grading/pipeline/investigation-context.service';
import { StorageService } from '../src/storage/storage.service';
import { QUESTION, seedCodeSession, seedCodeSubmission, SOURCE } from './helpers/code-session-seed';

/** Ngữ cảnh điều tra dựng từ DB và kho lưu trữ (§5, §2.1); thiếu thước / đề chữ là không chấm được (§4.4). */
describe('InvestigationContextService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storage: StorageService;
  let contexts: InvestigationContextService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    storage = app.get(StorageService);
    contexts = app.get(InvestigationContextService);
  });
  afterAll(async () => app.close());

  it('phiên đủ đồ → ngữ cảnh đủ: ngôn ngữ, đề chữ, bài nộp, gói test, bảng lỗi của giảng viên', async () => {
    const s = await seedCodeSession(ds, storage, 'ic-ok');
    const { resultId } = await seedCodeSubmission(ds, storage, s);
    const built = await contexts.build(resultId);
    expect(built.kind).toBe('ok');
    if (built.kind !== 'ok') throw new Error('unreachable');
    expect(built.teacherId).toBe(s.ctx.teacherId);
    expect(built.ctx).toMatchObject({
      language: 'cpp',
      problemStatement: QUESTION,
      requiredComplexity: null,
      driver: null,
      entry: null,
      submission: { files: [{ path: 'main.cpp', content: SOURCE }] },
      testBundle: { id: s.bundleId, cases: [
        { name: 'c1', group: 'co_ban', input: '1', expected: '1' },
        { name: 'c2', group: 'bien', input: '2', expected: '2' },
      ] },
      modelAnswerAvailable: false,
    });
    expect(built.ctx.rules.map((r) => [r.ruleKey, r.checkedBy, r.priced])).toEqual([
      ['sai_bien', 'machine', true],
      ['ten_bien', 'model', true],
    ]);
    expect(built.ruleTable).toEqual([
      { ruleKey: 'sai_bien', checkedBy: 'machine' },
      { ruleKey: 'ten_bien', checkedBy: 'model' },
    ]);
    expect(built.ctx.budget.maxToolCalls).toBeGreaterThan(0);
  });

  it('phiên chưa ghim gói test → system, nêu gói test', async () => {
    const s = await seedCodeSession(ds, storage, 'ic-nobundle');
    await ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = NULL WHERE id = $1`, [s.ctx.sessionId]);
    const { resultId } = await seedCodeSubmission(ds, storage, s);
    expect(await contexts.build(resultId)).toMatchObject({ kind: 'ungradable', class: 'system', reason: expect.stringMatching(/gói test/) });
  });

  it('đề chỉ có bản PDF (chưa đọc được thành chữ) → system, nêu đề', async () => {
    const s = await seedCodeSession(ds, storage, 'ic-pdf', { questionFilename: 'de-bai.pdf', question: '%PDF-1.4 ...' });
    const { resultId } = await seedCodeSubmission(ds, storage, s);
    expect(await contexts.build(resultId)).toMatchObject({ kind: 'ungradable', class: 'system', reason: expect.stringMatching(/đề bài/) });
  });

  it('phiên không có đề → system, nêu đề', async () => {
    const s = await seedCodeSession(ds, storage, 'ic-noq', { question: null });
    const { resultId } = await seedCodeSubmission(ds, storage, s);
    expect(await contexts.build(resultId)).toMatchObject({ kind: 'ungradable', class: 'system', reason: expect.stringMatching(/đề bài/) });
  });

  it('bài nộp RAR → submission (chấm tay)', async () => {
    const s = await seedCodeSession(ds, storage, 'ic-rar');
    const { resultId } = await seedCodeSubmission(ds, storage, s, Buffer.concat([Buffer.from('Rar!\x1a\x07\x00', 'latin1'), Buffer.alloc(32)]));
    expect(await contexts.build(resultId)).toMatchObject({ kind: 'ungradable', class: 'submission' });
  });
});
