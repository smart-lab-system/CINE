import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { StorageService } from '../storage/storage.service';
import { ContentResolverRegistry } from './content-resolver/content-resolver.registry';
import { GradingResultEntity } from './entities/grading-result.entity';
import { locateEvidence, type EvidenceSpan } from './harness/evidence-check';
import { TRUNCATION_NOTICE } from './grading.types';

export interface SubmissionTextSpan {
  criterionId: string;
  /** Chỉ số trong `paragraphs`. */
  paragraph: number;
  /** Offset trong ĐÚNG đoạn đó, không phải trong cả bài. */
  start: number;
  end: number;
}

export interface SubmissionTextView {
  paragraphs: string[];
  spans: SubmissionTextSpan[];
  /** Tiêu chí có dẫn chứng nhưng không định vị được — khớp `check: 'unverified'`. */
  unlocatable: string[];
  /** Bài đã bị cắt LÚC CHẤM. Phần sau đó model chưa bao giờ đọc. */
  truncatedByGrading: boolean;
}

export interface Paragraph {
  text: string;
  start: number;
  end: number;
}

/**
 * Chẻ đoạn mà GIỮ offset gốc.
 *
 * `String.prototype.split` vứt mất vị trí, và vị trí là toàn bộ thứ hàm này
 * tồn tại để giữ. Ranh giới là một dòng trống trở lên — đúng thứ
 * `mammoth.extractRawText` sinh ra giữa hai paragraph của Word; xuống dòng
 * mềm bên trong một paragraph thì không.
 */
export function splitParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  const re = /\n{2,}/g;
  let at = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out.push({ text: text.slice(at, match.index), start: at, end: match.index });
    at = match.index + match[0].length;
  }
  // Luôn đẩy đoạn cuối, kể cả khi rỗng: một mảng rỗng sẽ khiến màn hình vẽ
  // khung trắng không lời giải thích, thay vì nói "chưa đọc được nội dung".
  out.push({ text: text.slice(at), start: at, end: text.length });
  return out;
}

/**
 * Quy span toàn cục về offset trong từng đoạn.
 *
 * Một span vắt qua ranh giới đoạn ra NHIỀU span cùng `criterionId`. Đó là ca
 * thường, không phải ca biên: phép chuẩn hoá gộp dòng trống thành một dấu
 * cách, nên model trích một câu qua hai đoạn là hoàn toàn hợp lệ và guard
 * chấm nó `ok`.
 */
export function toParagraphSpans(
  paragraphs: Paragraph[],
  criterionId: string,
  spans: EvidenceSpan[],
): SubmissionTextSpan[] {
  const out: SubmissionTextSpan[] = [];
  for (const span of spans) {
    paragraphs.forEach((paragraph, index) => {
      const start = Math.max(span.start, paragraph.start);
      const end = Math.min(span.end, paragraph.end);
      // Phần span rơi đúng vào dòng trống giữa hai đoạn không thuộc đoạn nào.
      if (start >= end) {
        return;
      }
      out.push({
        criterionId,
        paragraph: index,
        start: start - paragraph.start,
        end: end - paragraph.start,
      });
    });
  }
  return out;
}

/** Hình dạng tối thiểu của một phần tử `criterion_results` mà hàm này đọc. */
interface StoredCriterionResult {
  criterionId: string;
  evidence?: string;
}

/**
 * Bài làm, kèm VỊ TRÍ mọi dẫn chứng AI đã trích.
 *
 * Định vị chạy ở đây, không ở client — spec 2026-09-16 §5.2.
 * `normalizeForMatch` đối chiếu trên cả bài đã LÀM PHẲNG, nên chỉ phía nào
 * cầm nguyên chuỗi đó mới định vị đúng được. Client chẻ đoạn rồi tự so sẽ
 * trượt đúng những trích dẫn vắt đoạn, và hiện "không tìm thấy trong bài
 * làm" cho câu mà guard đã chấm `ok` — tức màn hình vu cho AI bịa dẫn
 * chứng, ở đúng tính năng tồn tại để chứng minh nó không bịa.
 */
@Injectable()
export class SubmissionTextService {
  private readonly logger = new Logger(SubmissionTextService.name);

  constructor(
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
    private readonly storage: StorageService,
    private readonly resolvers: ContentResolverRegistry,
  ) {}

  async forResult(result: GradingResultEntity): Promise<SubmissionTextView> {
    const submission = await this.submissions.findOneOrFail({
      where: { id: result.submissionId },
    });
    const deliverable = await this.deliverables.findOneOrFail({
      where: { id: submission.requiredDeliverableId },
    });

    let text = '';
    try {
      if (submission.storageKey) {
        const bytes = await this.storage.getObject(submission.storageKey);
        // CÙNG resolver với lúc chấm. Một đường trích text thứ hai là một
        // đường cho ra chuỗi khác, và mọi toạ độ sẽ lệch theo.
        const resolved = await this.resolvers
          .for(deliverable.deliverableType)
          .resolve(bytes, deliverable.requiredFilename);
        text = resolved.text;
      }
    } catch (error) {
      // Cùng cách xử lý với `gradeOne`: không đọc được là sự thật về việc
      // trích xuất, không phải phán xét về bài làm. Trả rỗng để màn hình
      // nói "định dạng này chưa đọc được", thay vì ném 500 lên mặt giảng
      // viên đang duyệt bài thứ 35.
      this.logger.warn(
        `submission ${submission.id}: không đọc được nội dung — ${(error as Error).message}`,
      );
    }

    // NFC trước, và toạ độ nói về chuỗi sau nó — `locateEvidence` cũng NFC
    // hoá đầu vào của nó, nên hai bên phải cùng một hệ toạ độ.
    const nfc = text.normalize('NFC');
    const paragraphs = splitParagraphs(nfc);

    const spans: SubmissionTextSpan[] = [];
    const unlocatable: string[] = [];
    for (const stored of (result.criterionResults ?? []) as StoredCriterionResult[]) {
      const found = locateEvidence(nfc, stored.evidence ?? '', { spans: true });
      if (found.check === 'ok') {
        spans.push(...toParagraphSpans(paragraphs, stored.criterionId, found.spans));
      } else if (found.check === 'unverified') {
        // `empty` KHÔNG vào đây: trích dẫn rỗng nghĩa là sinh viên không đề
        // cập tiêu chí, một tín hiệu hợp lệ — khác hẳn AI trích một câu
        // không có trong bài.
        unlocatable.push(stored.criterionId);
      }
    }

    return {
      paragraphs: paragraphs.map((paragraph) => paragraph.text),
      spans,
      unlocatable,
      truncatedByGrading: nfc.trimEnd().endsWith(TRUNCATION_NOTICE.trim()),
    };
  }
}
