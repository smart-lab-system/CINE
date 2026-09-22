import { Logger } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { RubricEntity } from '../../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../../grading/entities/rubric-criterion.entity';

/**
 * Một nguồn tri thức của giảng viên, render thành văn bản cho prompt.
 *
 * Là DANH SÁCH CẮM THÊM ĐƯỢC, không phải ba tham số cứng (spec soạn đề §2).
 * Hôm nay mảng có một phần tử thật (rubric) cộng prompt gõ tay; ngày bảng lỗi
 * của spec chấm §2.1 ra đời thì thêm một phần tử, không sửa chỗ nào khác.
 */
export interface KnowledgeSource {
  kind: 'prompt' | 'rubric' | 'error_table';
  /** Rỗng = nguồn chưa tồn tại hoặc chưa có dữ liệu. KHÔNG phải lỗi. */
  render(teacherId: string): Promise<string>;
}

const logger = new Logger('KnowledgeSource');

/** Bao nhiêu rubric gần nhất được đọc. Đủ để model thấy giảng viên tính điểm
 *  cho cái gì; nhiều hơn chỉ làm loãng prompt. */
const MAX_RUBRICS = 5;

/**
 * Gom mọi nguồn, bỏ cái rỗng.
 *
 * Một nguồn ném thì GHI LOG rồi đi tiếp, không làm hỏng cả lượt soạn đề:
 * giảng viên đang ngồi đợi, và mất một nguồn phụ trợ thì đề vẫn sinh được —
 * mất cả lượt thì không. Đây là đánh đổi có chủ ý và nó KHÁC hẳn đường chấm
 * điểm, nơi thiếu dữ liệu phải dừng lại (spec chấm §4.4): ở đó một cuộc điều
 * tra thiếu dữ liệu đẻ ra một con số sai mà không ai thấy, còn ở đây giảng
 * viên đọc đề ngay trước mắt.
 */
export async function collectKnowledge(
  sources: KnowledgeSource[],
  teacherId: string,
): Promise<string[]> {
  const out: string[] = [];
  for (const source of sources) {
    try {
      const text = await source.render(teacherId);
      if (text.trim().length > 0) {
        out.push(text);
      }
    } catch (error) {
      logger.warn(`nguồn tri thức "${source.kind}" hỏng, bỏ qua: ${String(error)}`);
    }
  }
  return out;
}

/**
 * Rubric của chính giảng viên đó — nguồn tri thức sẵn có DUY NHẤT tồn tại
 * hôm nay.
 *
 * Lọc `teacherId` là ranh giới cách ly thật, cùng luật với
 * `unique(teacher_id, name, version)` mà đợt cắt master data đã chốt: rubric
 * của giảng viên khác không bao giờ được đọc để sinh đề cho người này.
 *
 * HAI truy vấn chứ không một `relations: { criteria: true }`, cố ý:
 * `RubricEntity` không khai quan hệ `criteria`, và `rubric-criterion.entity.ts`
 * nói rõ vì sao — "every read of this table filters on rubric_id and nothing
 * else". Thêm một `@OneToMany` vào entity của module chấm chỉ để tiện cho
 * module này là đổi hình dạng một thứ dùng chung vì nhu cầu của một người
 * dùng nó.
 */
export class RubricKnowledgeSource implements KnowledgeSource {
  readonly kind = 'rubric' as const;

  constructor(
    private readonly rubrics: Repository<RubricEntity>,
    private readonly criteria: Repository<RubricCriterionEntity>,
  ) {}

  async render(teacherId: string): Promise<string> {
    const rubrics = await this.rubrics.find({
      where: { teacherId, isActive: true },
      order: { updatedAt: 'DESC' },
      take: MAX_RUBRICS,
    });
    if (rubrics.length === 0) {
      return '';
    }

    const rows = await this.criteria.find({
      where: { rubricId: In(rubrics.map((r) => r.id)) },
    });

    const byRubric = new Map<string, RubricCriterionEntity[]>();
    for (const row of rows) {
      const list = byRubric.get(row.rubricId);
      if (list) list.push(row);
      else byRubric.set(row.rubricId, [row]);
    }

    // Rubric không có tiêu chí nào thì bỏ hẳn: nó không nói gì về cách giảng
    // viên chấm, nên nhét tên nó vào prompt chỉ làm loãng.
    const blocks = rubrics
      .filter((r) => (byRubric.get(r.id)?.length ?? 0) > 0)
      .map((r) => {
        const lines = (byRubric.get(r.id) ?? [])
          .map((c) => `  - ${c.description} (${c.maxPoints} điểm)`)
          .join('\n');
        return `Rubric "${r.name}":\n${lines}`;
      });

    if (blocks.length === 0) {
      return '';
    }

    return (
      'Giảng viên này chấm theo các tiêu chí sau. Đề sinh ra nên hỏi được đúng ' +
      `những thứ đó:\n\n${blocks.join('\n\n')}`
    );
  }
}
