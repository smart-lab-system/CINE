import '../setup-env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { StorageService } from '../../src/storage/storage.service';
import { ScoreService } from '../../src/grading/scoring/score.service';
import { resultWith } from '../../src/grading/decision/testing/result';
import type { StoredInvestigation } from '../../src/grading/scoring/stored-investigation';
import type { ToolCall } from '../../src/grading/investigator/types';
import { createTestAccount } from '../helpers/create-account';
import { seedSession, seedResult } from '../helpers/grading-seed';
import { seedInvestigatorSession, seedRule, seedPrices, seedInvestigatorResult, storedWith } from '../helpers/investigator-seed';
import { putObject } from '../helpers/code-session-seed';

const SOURCE_OK = `#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<int> a(n);for(auto&x:a)cin>>x;for(auto x:a)cout<<x<<" ";}
`;

const SEEN = [
  { ruleKey: 'sai_bien', checkedBy: 'machine' as const },
  { ruleKey: 'ten_bien', checkedBy: 'model' as const },
];

/**
 * Dựng một hồ sơ "không chấm được" TRỰC TIẾP qua `ScoreService.finishAttempt`, tái dùng đúng con
 * đường thật thay vì bịa cột — mirror `InvestigatorRunService.startAttempt`'s INSERT (outcome/
 * investigation để trống), rồi để `finishAttempt` tự đóng lượt qua `closeUngradable` (giữ nguyên
 * đường điều tra thật, khác `finishUngradable` vốn luôn ghi `investigation = NULL`).
 */
async function seedUngradable(
  ds: DataSource,
  scores: ScoreService,
  ctx: Awaited<ReturnType<typeof seedSession>>,
  ungradable: { class: 'system' | 'submission'; reason: string },
  calls: ToolCall[],
): Promise<string> {
  const { resultId } = await seedResult(ds, ctx, 'investigator');
  const [a] = await ds.query(
    `INSERT INTO examcollect.grading_attempt (grading_result_id, attempt_no, triggered_by, started_at)
     VALUES ($1, 1, $2, clock_timestamp()) RETURNING id`,
    [resultId, ctx.teacherId],
  );
  await ds.query(`UPDATE examcollect.grading_result SET current_attempt_id = $2 WHERE id = $1`, [resultId, a.id]);
  const stored: StoredInvestigation = {
    version: 1,
    result: resultWith({ kind: 'ungradable', ungradable, calls }),
    rulesSeen: SEEN,
    ruleTable: SEEN,
    modelCeiling: 1,
  };
  await scores.finishAttempt(resultId, a.id, stored, { modelUsed: null, tokensIn: 0, tokensOut: 0, sandboxHost: null });
  return resultId;
}

async function main() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const ds = app.get(DataSource);
  const storage = app.get(StorageService);
  const scores = app.get(ScoreService);

  const email = `ui_teacher_${Date.now()}@example.com`;
  const password = 'correct-horse-battery';
  const teacherId = await createTestAccount(ds, { email, password, role: 'teacher' });

  const ctx = await seedSession(ds, 'ui-dossier', { teacherId, deliverableType: 'code_project', language: 'cpp' });
  await ds.query('UPDATE examcollect.exam_session SET rubric_id = $1 WHERE id = $2', [ctx.rubricId, ctx.sessionId]);
  await seedInvestigatorSession(ds, ctx);

  const bien = await seedRule(ds, teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
  await seedRule(ds, teacherId, 'ten_bien', 'trinh_bay'); // model-checked, LEFT UNPRICED on purpose
  await seedPrices(ds, teacherId, { [bien.ruleId]: '1.50' });

  async function seedInvestigatorSubmission(label: string, modelErrors: string[], bienFails: boolean) {
    const key = `e2e/ui-dossier/${label}-${Date.now()}`;
    await putObject(storage, key, SOURCE_OK);
    const { resultId } = await seedInvestigatorResult(ds, ctx, storedWith(SEEN, modelErrors, bienFails));
    await scores.computeInitial(resultId);
    return resultId;
  }

  // 1. flagged: machine rule fires (bien fails) AND the model-reported ten_bien is unpriced
  const flaggedUnpriced = await seedInvestigatorSubmission('flagged', ['ten_bien'], true);
  // 2. clean run — bien group passes, no model errors reported → nothing deducted, auto-approved
  const autoApproved = await seedInvestigatorSubmission('auto', [], false);
  // 3. không chấm được — lỗi phía hệ thống (môi trường chạy bài không phản hồi)
  const ungradableSystem = await seedUngradable(
    ds, scores, ctx,
    { class: 'system', reason: 'Môi trường chạy bài không phản hồi sau 3 lần thử, lần cuối lúc 10:15:42.' },
    [
      { id: 'tc-1', tool: 'list_files', args: {}, status: 'ok', output: 'sort.py\nmain.py', structuredRef: null, startedAt: '2026-09-25T00:00:00.000Z', wallMs: 100, injectionSuspected: false },
      { id: 'tc-2', tool: 'run_tests', args: { group: 'co_ban' }, status: 'error', output: 'Môi trường chạy bài hết giờ', structuredRef: null, startedAt: '2026-09-25T00:00:05.000Z', wallMs: 6200, injectionSuspected: false },
      { id: 'tc-3', tool: 'run_tests', args: { group: 'co_ban' }, status: 'error', output: 'Môi trường chạy bài hết giờ', structuredRef: null, startedAt: '2026-09-25T00:00:12.000Z', wallMs: 1400, injectionSuspected: false },
      { id: 'tc-4', tool: 'run_tests', args: { group: 'co_ban' }, status: 'error', output: 'Môi trường chạy bài hết giờ', structuredRef: null, startedAt: '2026-09-25T00:00:14.000Z', wallMs: 900, injectionSuspected: false },
    ],
  );
  // 4. không chấm được — bài nộp hỏng (không đọc được file nộp)
  const ungradableSubmission = await seedUngradable(
    ds, scores, ctx,
    { class: 'submission', reason: 'Không đọc được file nộp — rỗng hoặc hỏng.' },
    [{ id: 'tc-1', tool: 'read_file', args: { path: 'bai-nop/main.cpp' }, status: 'error', output: 'File rỗng', structuredRef: null, startedAt: '2026-09-25T00:00:00.000Z', wallMs: 50, injectionSuspected: false }],
  );

  const out = {
    email,
    password,
    sessionId: ctx.sessionId,
    results: { flaggedUnpriced, autoApproved, ungradableSystem, ungradableSubmission },
  };
  fs.writeFileSync(path.join(__dirname, 'seed-output.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
