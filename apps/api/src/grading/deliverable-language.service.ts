import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { DeclaredLanguage } from '../exam-session/declared-language';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { GRADING_LOCKED_MESSAGE, isGradingLocked } from './grading-lock';
import type { GradingPipeline } from './grading-model.types';
import { pipelineFor } from './pipeline';

export interface DeclaredLanguageView {
  id: string;
  language: DeclaredLanguage;
  pipeline: GradingPipeline;
}

/**
 * Khai ngôn ngữ của MỘT yêu cầu nộp code sau khi phiên đã tạo (G1 §3).
 *
 * `pipeline` được gán một lần lúc `startGrading` tạo dòng kết quả và trigger vòng đời chặn đổi (§2.3 luật 8), nên
 * một bài đã có dòng kết quả thì KHÔNG khai được nữa — khai rồi mà đường chấm vẫn cũ là một lời nói dối. Nằm ở
 * module chấm điểm chứ không ở module phiên thi vì cần `isGradingLocked`, mà `GradingModule` đã import
 * `ExamSessionModule`, không phải ngược lại.
 */
@Injectable()
export class DeliverableLanguageService {
  constructor(
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
  ) {}

  async declare(session: ExamSessionEntity, deliverableId: string, language: DeclaredLanguage): Promise<DeclaredLanguageView> {
    const deliverable = await this.deliverables.findOne({ where: { id: deliverableId, examSessionId: session.id } });
    if (!deliverable) throw new NotFoundException('Yêu cầu nộp này không thuộc phiên thi này.');
    if (deliverable.deliverableType !== 'code_project') {
      throw new BadRequestException('Chỉ bài code mới khai được ngôn ngữ — yêu cầu nộp này không phải bài code.');
    }
    if (await isGradingLocked(this.deliverables.manager, session.id)) {
      throw new ConflictException(`${GRADING_LOCKED_MESSAGE} — ngôn ngữ khoá cùng tài liệu chấm.`);
    }
    // Một câu UPDATE có điều kiện: kiểm "chưa có dòng kết quả nào" và ghi trong cùng một lệnh, nên không có
    // khoảng hở giữa hai bước. (`startGrading` không khoá dòng khai báo — chỗ đó vẫn còn một cửa sổ hẹp, ghi ở ledger.)
    const updated = await this.deliverables
      .createQueryBuilder()
      .update()
      .set({ language })
      .where('id = :id', { id: deliverable.id })
      .andWhere(
        `NOT EXISTS (
           SELECT 1 FROM examcollect.grading_result g JOIN examcollect.submission s ON s.id = g.submission_id
            WHERE s.required_deliverable_id = required_deliverable.id
         )`,
      )
      .execute();
    if (!updated.affected) {
      throw new ConflictException('Bài này đã có kết quả chấm, nên đường chấm đã cố định — không đổi ngôn ngữ được nữa.');
    }
    return { id: deliverable.id, language, pipeline: pipelineFor({ deliverableType: deliverable.deliverableType, language }) };
  }
}
