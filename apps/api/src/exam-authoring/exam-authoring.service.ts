import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiUsageEntity } from './entities/ai-usage.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../grading/entities/rubric-criterion.entity';
import {
  AuthoringOutcome,
  EXAM_AUTHORING_PROVIDER,
  ExamAuthoringProvider,
  GeneratedExam,
} from './ai-provider/exam-authoring-provider';
import {
  KnowledgeSource,
  RubricKnowledgeSource,
  collectKnowledge,
} from './knowledge/knowledge-source';
import { GenerateExamDto } from './dto/generate-exam.dto';

@Injectable()
export class ExamAuthoringService {
  private readonly logger = new Logger(ExamAuthoringService.name);

  constructor(
    @Inject(EXAM_AUTHORING_PROVIDER) private readonly provider: ExamAuthoringProvider,
    @InjectRepository(RubricEntity) private readonly rubrics: Repository<RubricEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(AiUsageEntity) private readonly usage: Repository<AiUsageEntity>,
  ) {}

  /**
   * Sinh một bộ ba. KHÔNG lưu nội dung ở đâu cả (spec §9) — hàm này trả về
   * rồi quên. Thứ duy nhất ở lại là một dòng `ai_usage`.
   *
   * Lượt SINH LẠI MỘT CÂU đi qua đúng hàm này với `questionCount: 1` cộng ba
   * trường `avoid`/`refineNote`/`existingStatements`, nên nó ghi một dòng
   * usage RIÊNG. Cố ý: đó là một lời gọi model tốn tiền thật, và gộp vào lượt
   * gốc thì con số "soạn một đề tốn bao nhiêu" nói dối theo hướng rẻ đi —
   * đúng con số sẽ đi vào báo cáo, đứng cạnh chi phí mỗi bài chấm.
   */
  async generate(teacherId: string, dto: GenerateExamDto): Promise<GeneratedExam> {
    const sources: KnowledgeSource[] = [
      new RubricKnowledgeSource(this.rubrics, this.criteria),
    ];
    const knowledge = await collectKnowledge(sources, teacherId);

    const outcome = await this.provider.generate({
      prompt: dto.prompt,
      knowledge,
      questionCount: dto.questionCount,
      language: dto.language,
      avoid: dto.avoid,
      refineNote: dto.refineNote,
      existingStatements: dto.existingStatements,
    });

    await this.recordUsage(teacherId, outcome);
    return outcome.exam;
  }

  /**
   * Ghi dấu vết vận hành, và cố ý NUỐT lỗi.
   *
   * Giảng viên đã có đề trong tay rồi; làm hỏng lượt soạn đề vì không ghi
   * được một dòng thống kê là đánh đổi sai chiều. Nhưng nó phải KÊU trong
   * log, vì im lặng thì dashboard chi phí thiếu số mà không ai biết vì sao.
   */
  private async recordUsage(teacherId: string, outcome: AuthoringOutcome): Promise<void> {
    try {
      await this.usage.save(
        this.usage.create({
          teacherId,
          feature: 'exam_authoring',
          modelUsed: outcome.usage.modelUsed,
          inputTokens: outcome.usage.inputTokens,
          outputTokens: outcome.usage.outputTokens,
          // `null`, KHÔNG phải 0: chưa có bảng giá cho model này, và ghi 0 sẽ
          // làm tổng chi phí nói dối theo hướng an toàn giả.
          costUsd: null,
          questionCount: outcome.exam.questions.length,
          verificationStatus: outcome.exam.verification.status,
        }),
      );
    } catch (error) {
      this.logger.error(
        `không ghi được ai_usage cho giảng viên ${teacherId}: ${String(error)}`,
      );
    }
  }
}
