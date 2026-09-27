import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateTestBundleDto } from './dto/create-test-bundle.dto';

/**
 * Gói test có phiên bản của MỘT phiên (§14.1). Raw SQL qua `DataSource`,
 * không repository — `grading_test_bundle`/`grading_test_case` là append-only
 * ở DB (`guard_test_bundle_approve_once`, `guard_append_only`, `guard_no_delete`),
 * và service này là nơi DUY NHẤT kiểm điều kiện TRƯỚC khi ghi: trigger của DB
 * chỉ là lưới an toàn cuối, và mã lỗi nó ném (`object_not_in_prerequisite_state`)
 * không được `PostgresExceptionFilter` map, nên chạm tới nó là một 500.
 */
@Injectable()
export class TestBundleService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async create(examSessionId: string, teacherId: string, dto: CreateTestBundleDto) {
    return this.ds.transaction(async (manager) => {
      const [{ next_version }] = await manager.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM examcollect.grading_test_bundle WHERE exam_session_id = $1`,
        [examSessionId],
      );
      const [bundle] = await manager.query(
        `INSERT INTO examcollect.grading_test_bundle (exam_session_id, version, origin, created_by)
         VALUES ($1, $2, 'teacher', $3) RETURNING id, version`,
        [examSessionId, next_version, teacherId],
      );
      for (const c of dto.cases) {
        await manager.query(
          `INSERT INTO examcollect.grading_test_case (bundle_id, case_key, "group", input, expected_output, constraint_quote)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [bundle.id, c.caseKey, c.group, c.input, c.expectedOutput, c.constraintQuote ?? null],
        );
      }
      return { id: bundle.id as string, version: bundle.version as number };
    });
  }

  async approve(examSessionId: string, bundleId: string, teacherId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    if (bundle.approved_at) {
      throw new ConflictException(
        `Gói test ${bundleId} đã được duyệt lúc ${bundle.approved_at} — không duyệt lại được.`,
      );
    }
    const [row] = await this.ds.query(
      `UPDATE examcollect.grading_test_bundle SET approved_by = $1, approved_at = now()
        WHERE id = $2 RETURNING id, approved_at`,
      [teacherId, bundleId],
    );
    return { id: row.id as string, approvedAt: row.approved_at as string };
  }

  async pin(examSessionId: string, bundleId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    if (!bundle.approved_at) {
      throw new BadRequestException(
        `Gói test ${bundleId} chưa được duyệt — chỉ gói đã duyệt mới ghim được (§14.1).`,
      );
    }
    await this.ds.query(`UPDATE examcollect.exam_session SET test_bundle_id = $1 WHERE id = $2`, [
      bundleId,
      examSessionId,
    ]);
    return { testBundleId: bundleId };
  }

  async list(examSessionId: string) {
    return this.ds.query(
      `SELECT b.id, b.version, b.approved_at, COUNT(c.id)::int AS case_count
         FROM examcollect.grading_test_bundle b
         LEFT JOIN examcollect.grading_test_case c ON c.bundle_id = b.id AND c.auto_dropped_reason IS NULL
        WHERE b.exam_session_id = $1
        GROUP BY b.id ORDER BY b.version DESC`,
      [examSessionId],
    );
  }

  async get(examSessionId: string, bundleId: string) {
    const bundle = await this.findOwnedBundle(examSessionId, bundleId);
    const cases = await this.ds.query(
      `SELECT case_key, "group", input, expected_output, auto_dropped_reason
         FROM examcollect.grading_test_case WHERE bundle_id = $1 ORDER BY case_key`,
      [bundleId],
    );
    return { id: bundle.id, version: bundle.version, approvedAt: bundle.approved_at, cases };
  }

  /** Gói phải thuộc ĐÚNG phiên được truyền vào (Review Focus #3). */
  private async findOwnedBundle(examSessionId: string, bundleId: string) {
    const [bundle] = await this.ds.query(
      `SELECT id, version, approved_at FROM examcollect.grading_test_bundle
        WHERE id = $1 AND exam_session_id = $2`,
      [bundleId, examSessionId],
    );
    if (!bundle) {
      throw new NotFoundException(`Gói test ${bundleId} không thuộc phiên ${examSessionId}`);
    }
    return bundle;
  }
}
