import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AutoBreakerService } from '../auto-breaker/auto-breaker.service';
import { advanceStatus } from '../lifecycle/advance';
import { latestComputationRow, loadCurrentScore, lockTeacherScoring } from '../scoring/score-inputs';
import { StorageService } from '../../storage/storage.service';
import { compareAudit, type AuditSummary, type AuditVerdict } from './audit-compare';

export const AUDIT_EXTRA_MAX_LENGTH = 500;

export const AUDIT_MESSAGES = {
  notSampled: 'Bài này không ở trạng thái kiểm mẫu — không ghi nhận xét kiểm mẫu được.',
  locked: 'Nhận xét kiểm mẫu của bài này đã ghi — khoá, không ghi lại được.',
  foreignRule: 'Có luật được chọn không thuộc bảng lỗi đang dùng của bạn.',
  blankExtra: 'Mỗi lỗi khác phải có nội dung.',
  longExtra: `Mỗi lỗi khác tối đa ${AUDIT_EXTRA_MAX_LENGTH} ký tự.`,
  noFile: 'Bài này chưa có file trên kho lưu trữ.',
} as const;

/** Bản tiết lộ: lúc che mù kết thúc. */
export interface AuditReveal {
  status: 'teacher_reviewed';
  currentScore: number | null;
  currentScoreSource: string;
  systemErrors: { ruleId: string; ruleKey: string; ruleName: string; counted: 'counted' | 'unpriced' }[];
  perRule: { ruleId: string; ruleKey: string; ruleName: string; verdict: AuditVerdict }[];
  extraErrors: string[];
  summary: AuditSummary;
}

@Injectable()
export class AuditReviewService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
    private readonly breakers: AutoBreakerService,
  ) {}

  /**
   * Ghi nhận xét kiểm mẫu VÀ tiết lộ, trong MỘT transaction: không có khoảng "đã ghi mà chưa mở" để nhãn bị sửa.
   * Quyền sở hữu do controller kiểm trước (`findResultForOwner`).
   *
   * Thứ tự khoá như `ErrorExceptionService.lockEditable`: khoá chấm điểm của giảng viên rồi mới khoá dòng.
   * Nhãn chỉ-thêm ở DB (khoá chính = id kết quả + `guard_append_only`), nhưng kiểm tường minh TRƯỚC khi ghi để
   * trả một câu tiếng Việt thay vì 23505 chung chung.
   *
   * Bài sang `teacher_reviewed`; điểm là lượt tính mới nhất của hệ thống, KHÔNG đổi, và không có dòng
   * `teacher_review` — `finalizeGrades` chốt bài điều tra `teacher_reviewed` không cần nó. Bất đồng thì giảng
   * viên dùng đường có sẵn (ngoại lệ, chấm tay): giờ mở vì `teacher_reviewed` sửa được.
   *
   * Cũng trong transaction này: nhãn của cầu dao tự chốt (spec 2026-10-21 §5.3) và, nếu một phạm vi tắt, lượt hạ bậc
   * các bài chưa chốt thuộc phạm vi đó. Lỗi ở đó lùi cả nhận xét kiểm mẫu — không có nhãn nào "đã ghi mà chưa đếm".
   */
  async record(
    teacherId: string,
    resultId: string,
    dto: { pickedRuleIds: string[]; extraErrors: string[] },
  ): Promise<AuditReveal> {
    const picked = [...new Set(dto.pickedRuleIds)];
    const extras = dto.extraErrors.map((line) => line.trim());
    if (extras.some((line) => line === '')) throw new BadRequestException(AUDIT_MESSAGES.blankExtra);
    if (extras.some((line) => line.length > AUDIT_EXTRA_MAX_LENGTH)) throw new BadRequestException(AUDIT_MESSAGES.longExtra);

    return this.ds.transaction(async (m) => {
      await lockTeacherScoring(m, teacherId);
      const [row] = await m.query(`SELECT status FROM examcollect.grading_result WHERE id = $1 FOR UPDATE`, [resultId]);
      if (!row) throw new ConflictException(AUDIT_MESSAGES.notSampled);
      // Nhãn đã có thì nói "khoá" TRƯỚC khi nói "không ở trạng thái kiểm mẫu": ghi nhãn đẩy bài sang
      // `teacher_reviewed`, nên với lần ghi thứ hai kiểm trạng thái trước sẽ luôn thắng và giảng viên chỉ nghe
      // "không ở trạng thái kiểm mẫu" — đúng nhưng không nói điều họ cần biết (nhãn đã ghi và đã khoá).
      const [done] = await m.query(`SELECT 1 FROM examcollect.audit_sample_review WHERE grading_result_id = $1`, [resultId]);
      if (done) throw new ConflictException(AUDIT_MESSAGES.locked);
      if (row.status !== 'audit_pending') throw new ConflictException(AUDIT_MESSAGES.notSampled);

      // Luật hợp lệ = bảng lỗi ĐANG DÙNG của CHÍNH giảng viên (§8.1 luật 3), không phải mọi luật.
      const active: { id: string }[] = await m.query(
        `SELECT id FROM examcollect.error_rule WHERE teacher_id = $1 AND state = 'active'`,
        [teacherId],
      );
      const activeIds = new Set(active.map((r) => r.id));
      if (picked.some((id) => !activeIds.has(id))) throw new BadRequestException(AUDIT_MESSAGES.foreignRule);

      await m.query(
        `INSERT INTO examcollect.audit_sample_review (grading_result_id, teacher_id, picked_rule_ids, extra_errors)
         VALUES ($1, $2, $3, $4)`,
        [resultId, teacherId, picked, extras],
      );
      const moved = await advanceStatus(m, resultId, ['audit_pending'], 'teacher_reviewed', { flagForReview: false });
      if (!moved) throw new ConflictException(AUDIT_MESSAGES.notSampled);

      const reveal = await this.reveal(m, resultId, picked, extras, activeIds.size);
      await this.breakers.recordLabelsAndEvaluate(m, teacherId, resultId, reveal);
      return reveal;
    });
  }

  /** "Hệ thống thấy lỗi nào" = lượt tính mới nhất, bỏ lỗi bị bác (`refuted`) và bị bỏ (`excluded`). */
  private async reveal(
    m: EntityManager,
    resultId: string,
    picked: string[],
    extras: string[],
    activeRuleCount: number,
  ): Promise<AuditReveal> {
    const latest = await latestComputationRow(m, resultId);
    const kept = (latest?.breakdown.errors ?? []).filter((e) => e.counted === 'counted' || e.counted === 'unpriced');
    const cmp = compareAudit({
      picked,
      systemRuleIds: kept.map((e) => e.ruleId),
      extraCount: extras.length,
      activeRuleCount,
    });

    const ids = [...new Set([...cmp.perRule.map((r) => r.ruleId), ...kept.map((e) => e.ruleId)])];
    const names = new Map<string, { key: string; name: string }>();
    if (ids.length > 0) {
      const rows: { id: string; rule_key: string; name: string }[] = await m.query(
        `SELECT r.id, r.rule_key, v.name FROM examcollect.error_rule r
           JOIN examcollect.error_rule_revision v ON v.id = r.current_revision_id
          WHERE r.id = ANY($1::uuid[])`,
        [ids],
      );
      for (const r of rows) names.set(r.id, { key: r.rule_key, name: r.name });
    }
    const label = (ruleId: string, fallbackKey: string) => ({
      ruleKey: names.get(ruleId)?.key ?? fallbackKey,
      ruleName: names.get(ruleId)?.name ?? fallbackKey,
    });
    const score = await loadCurrentScore(m, resultId);
    return {
      status: 'teacher_reviewed',
      currentScore: score.value,
      currentScoreSource: score.source,
      systemErrors: kept.map((e) => ({
        ruleId: e.ruleId,
        ...label(e.ruleId, e.ruleKey),
        counted: e.counted as 'counted' | 'unpriced',
      })),
      perRule: cmp.perRule.map((r) => ({ ruleId: r.ruleId, ...label(r.ruleId, r.ruleId), verdict: r.verdict })),
      extraErrors: extras,
      summary: cmp.summary,
    };
  }

  /**
   * URL tải bài nộp của ĐÚNG bài này. Giảng viên không mở được bài nộp code từ màn chấm hôm nay, và
   * `SubmissionStatusItem` không mang `submissionId` nên khớp theo MSSV mơ hồ khi phiên có nhiều yêu cầu nộp.
   * Không lộ gì về phán đoán của hệ thống. Quyền sở hữu do controller kiểm trước.
   */
  async submissionDownload(resultId: string): Promise<{ downloadUrl: string; fileName: string }> {
    const [row] = await this.ds.query(
      `SELECT s.storage_key, rd.required_filename
         FROM examcollect.grading_result g
         JOIN examcollect.submission s ON s.id = g.submission_id
         JOIN examcollect.required_deliverable rd ON rd.id = s.required_deliverable_id
        WHERE g.id = $1`,
      [resultId],
    );
    if (!row?.storage_key) throw new NotFoundException(AUDIT_MESSAGES.noFile);
    const { downloadUrl } = await this.storage.generateDownloadUrl(row.storage_key as string, {
      filename: row.required_filename as string,
    });
    return { downloadUrl, fileName: row.required_filename as string };
  }
}
