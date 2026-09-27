import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { StorageService } from '../../src/storage/storage.service';
import { seedResult, seedSession, SeedSession } from './grading-seed';
import { seedInvestigatorSession, seedPrices, seedRule } from './investigator-seed';

/** Đưa byte lên kho lưu trữ thật (MinIO local) qua URL ký sẵn — khuôn `archive-check.e2e-spec.ts`. */
export async function putObject(storage: StorageService, key: string, body: Buffer | string): Promise<void> {
  const { uploadUrl } = await storage.generateUploadUrl(key);
  const bytes = typeof body === 'string' ? Buffer.from(body) : body;
  const res = await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array(bytes) });
  if (!res.ok) throw new Error(`upload ${key} → ${res.status}`);
}

export const QUESTION = 'Viết hàm tính tổng một mảng số nguyên. 1 ≤ n ≤ 1000.';
export const SOURCE = '#include <iostream>\nint main(){int n;std::cin>>n;std::cout<<n;}\n';

export interface CodeSession {
  ctx: SeedSession;
  bundleId: string;
  bien: { ruleId: string; revisionId: string };
  ten: { ruleId: string; revisionId: string };
}

/**
 * Phiên bài code C++ đủ đồ cho đường điều tra: rubric hai tiêu chí, gói test hai ca ghim vào phiên
 * (`investigator-seed`), hai luật có giá (`sai_bien` máy kiểm nhóm `bien`, `ten_bien` bằng lời),
 * đề `.txt` trong kho lưu trữ.
 */
export async function seedCodeSession(
  ds: DataSource,
  storage: StorageService,
  label: string,
  opts: { questionFilename?: string; question?: string | null } = {},
): Promise<CodeSession> {
  const ctx = await seedSession(ds, label, { deliverableType: 'code_project', language: 'cpp' });
  const { bundleId } = await seedInvestigatorSession(ds, ctx);
  const bien = await seedRule(ds, ctx.teacherId, 'sai_bien', 'tinh_dung', { kind: 'test_group_failed', group: 'bien' });
  const ten = await seedRule(ds, ctx.teacherId, 'ten_bien', 'trinh_bay');
  await seedPrices(ds, ctx.teacherId, { [bien.ruleId]: '1.50', [ten.ruleId]: '0.50' });
  if (opts.question !== null) {
    const fileName = opts.questionFilename ?? 'de-bai.txt';
    const key = `e2e/${label}/${randomUUID()}/${fileName}`;
    const body = Buffer.from(opts.question ?? QUESTION);
    await putObject(storage, key, body);
    const [material] = await ds.query(
      `INSERT INTO examcollect.exam_material (exam_session_id, storage_key, file_name, file_size) VALUES ($1, $2, $3, $4) RETURNING id`,
      [ctx.sessionId, key, fileName, body.length],
    );
    await ds.query(
      `INSERT INTO examcollect.grading_reference (exam_session_id, question_material_id, created_by) VALUES ($1, $2, $3)`,
      [ctx.sessionId, material.id, ctx.teacherId],
    );
  }
  return { ctx, bundleId, bien, ten };
}

/** Một bài nộp của phiên, byte thật trong kho; kết quả `investigator` ở `ai_grading`. */
export async function seedCodeSubmission(
  ds: DataSource,
  storage: StorageService,
  session: CodeSession,
  body: Buffer | string = SOURCE,
): Promise<{ resultId: string; submissionId: string }> {
  const key = `e2e/submissions/${randomUUID()}`;
  await putObject(storage, key, body);
  return seedResult(ds, session.ctx, 'investigator', key);
}
