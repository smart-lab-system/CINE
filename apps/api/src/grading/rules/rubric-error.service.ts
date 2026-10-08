import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

export interface OwnedAssignment {
  id: string;
  teacherId: string;
  rubricName: string;
  errorRuleId: string;
  criterionKey: string;
}

/** Dòng áp dụng của một lỗi trong một rubric (spec §2). Mở rộng ở Task A3. */
@Injectable()
export class RubricErrorService {
  constructor(@InjectDataSource() protected readonly ds: DataSource) {}

  /** Dòng áp dụng CHƯA GỠ của đúng giảng viên này; không thì 404 — không lộ dòng của người khác (T-POL-8). */
  async owned(m: EntityManager, teacherId: string, rubricErrorId: string): Promise<OwnedAssignment> {
    const [row] = await m.query(
      `SELECT id, teacher_id, rubric_name, error_rule_id, criterion_key
         FROM examcollect.rubric_error WHERE id = $1 AND teacher_id = $2 AND removed_at IS NULL`,
      [rubricErrorId, teacherId],
    );
    if (!row) throw new NotFoundException('Không tìm thấy lỗi trong rubric');
    return { id: row.id, teacherId: row.teacher_id, rubricName: row.rubric_name, errorRuleId: row.error_rule_id, criterionKey: row.criterion_key };
  }
}
