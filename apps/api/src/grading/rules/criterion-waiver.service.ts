import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { CriterionWaiverEntity } from '../entities/criterion-waiver.entity';
import { RubricCriterionEntity } from '../entities/rubric-criterion.entity';
import { RubricEntity } from '../entities/rubric.entity';
import { lockTeacherScoring } from '../scoring/score-inputs';
import { RecomputeSummary, ScoreService } from '../scoring/score.service';

/**
 * Đánh dấu *"tiêu chí này không có luật trừ"* (§4.2, T-FLOOR-6). Bảng riêng, vì `rubric_criterion`
 * bị khoá ngay khi rubric có kết quả chấm — đúng lúc giảng viên cần đánh dấu (§14.1). Đánh dấu hay
 * gỡ là một lượt tính lại tầng luật cho mọi bài của rubric đó (§14.3).
 */
@Injectable()
export class CriterionWaiverService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly scores: ScoreService,
  ) {}

  async set(
    teacherId: string,
    rubricId: string,
    criterionKey: string,
  ): Promise<{ waiverId: string; recompute: RecomputeSummary | null }> {
    return this.ds.transaction(async (m) => {
      // Khoá TRƯỚC mọi thứ khác: số phiên bản giá, bản sửa luật và mọi lượt tính lại xếp hàng theo giảng viên.
      await lockTeacherScoring(m, teacherId);
      await this.ownedRubric(m, teacherId, rubricId);
      const criterion = await m.getRepository(RubricCriterionEntity).findOne({ where: { rubricId, key: criterionKey } });
      if (!criterion) throw new BadRequestException(`Tiêu chí "${criterionKey}" không có trong rubric này`);
      const repo = m.getRepository(CriterionWaiverEntity);
      // Bấm hai lần là chuyện thường: đánh dấu còn hiệu lực thì trả nó, không ghi thêm.
      const active = await repo.findOne({ where: { rubricId, criterionKey, revokedAt: IsNull() } });
      if (active) return { waiverId: active.id, recompute: null };
      const row = await repo.save(repo.create({ rubricId, criterionKey, setBy: teacherId, revokedBy: null, revokedAt: null }));
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'criterion_waiver', teacherId, { rubricId });
      return { waiverId: row.id, recompute };
    });
  }

  async revoke(teacherId: string, waiverId: string): Promise<{ recompute: RecomputeSummary }> {
    return this.ds.transaction(async (m) => {
      // Khoá TRƯỚC mọi thứ khác: số phiên bản giá, bản sửa luật và mọi lượt tính lại xếp hàng theo giảng viên.
      await lockTeacherScoring(m, teacherId);
      const waiver = await m.getRepository(CriterionWaiverEntity).findOne({ where: { id: waiverId } });
      if (!waiver) throw new NotFoundException('Không tìm thấy đánh dấu');
      await this.ownedRubric(m, teacherId, waiver.rubricId, 'Không tìm thấy đánh dấu');
      const updated = await m
        .createQueryBuilder()
        .update(CriterionWaiverEntity)
        .set({ revokedBy: teacherId, revokedAt: () => 'now()' })
        .where('id = :id', { id: waiverId })
        .andWhere('revoked_at IS NULL')
        .execute();
      if ((updated.affected ?? 0) === 0) throw new ConflictException('Đánh dấu này đã được gỡ');
      const recompute = await this.scores.recomputeForTeacher(m, teacherId, 'criterion_waiver', teacherId, {
        rubricId: waiver.rubricId,
      });
      return { recompute };
    });
  }

  async list(teacherId: string, rubricId: string): Promise<{ id: string; criterionKey: string; setAt: Date }[]> {
    await this.ownedRubric(this.ds.manager, teacherId, rubricId);
    const rows = await this.ds.manager.getRepository(CriterionWaiverEntity).find({
      where: { rubricId, revokedAt: IsNull() },
      order: { criterionKey: 'ASC' },
    });
    return rows.map((r) => ({ id: r.id, criterionKey: r.criterionKey, setAt: r.setAt }));
  }

  /** Rubric của ĐÚNG giảng viên này; không thì 404 — không lộ rubric của người khác. */
  private async ownedRubric(m: EntityManager, teacherId: string, rubricId: string, message = 'Không tìm thấy rubric'): Promise<void> {
    const rubric = await m.getRepository(RubricEntity).findOne({ where: { id: rubricId, teacherId } });
    if (!rubric) throw new NotFoundException(message);
  }
}
