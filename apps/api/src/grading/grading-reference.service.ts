import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { ExamMaterialEntity } from '../exam-session/entities/exam-material.entity';
import { StorageService } from '../storage/storage.service';
import { GradingReferenceEntity } from './entities/grading-reference.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { UpsertGradingReferenceDto } from './dto/upsert-grading-reference.dto';
import type { ModelAnswerOrigin } from './grading-model.types';
import { GRADING_LOCKED_MESSAGE, isGradingLocked } from './grading-lock';

/**
 * Ba mức ngữ cảnh mà hệ thống có thể chấm với.
 *
 * Mức 1 là mức hệ thống chạy hôm nay — ÂM THẦM. Không cấm nó, nhưng không
 * để nó im lặng: một giảng viên chấm ở mức 1 mà tin mình đang ở mức 3 sẽ
 * để lọt đúng những em mà tính năng này sinh ra để bảo vệ.
 */
export type GradingReadinessLevel = 'rubric_only' | 'with_question' | 'with_model_answer';

export interface GradingReadiness {
  level: GradingReadinessLevel;
  /** `null` khi đủ tài liệu. Chuỗi này để UI hiện nguyên văn. */
  warning: string | null;
  hasQuestion: boolean;
  hasModelAnswer: boolean;
}

/** Tài liệu đã nạp sẵn, dạng dùng được cho prompt. */
export interface LoadedGradingReference {
  questionPdf?: Buffer;
  questionFilename?: string;
  modelAnswer?: Buffer;
  modelAnswerFilename?: string;
  note?: string;
  /**
   * Mức NGỮ CẢNH THẬT SỰ có được, tính từ những gì đọc được — khác với
   * `readiness()`, vốn báo mức đã CẤU HÌNH mà không chạm vào kho lưu trữ.
   *
   * Hai con số này lệch nhau khi file bị xoá khỏi kho sau khi đã ghi nhận.
   * Không có trường này thì giảng viên thấy "đủ tài liệu" trước khi bấm,
   * lượt chấm âm thầm chạy ở mức thấp hơn, và chỉ một dòng log biết điều đó.
   */
  loadedLevel: GradingReadinessLevel;
}

@Injectable()
export class GradingReferenceService {
  private readonly logger = new Logger(GradingReferenceService.name);

  constructor(
    @InjectRepository(GradingReferenceEntity)
    private readonly references: Repository<GradingReferenceEntity>,
    @InjectRepository(ExamMaterialEntity)
    private readonly materials: Repository<ExamMaterialEntity>,
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
    private readonly storage: StorageService,
  ) {}

  /**
   * Khoá storage của đáp án mẫu.
   *
   * Prefix `grading-reference/` TÁCH HẲN khỏi `materials/` mà
   * `ExamMaterialService` dùng — đó là toàn bộ cơ chế giữ cho đáp án không
   * bao giờ lọt vào `listForAgent`. Đổi prefix này mà không đọc
   * `exam-material.service.ts` là cách làm rò đáp án.
   */
  private answerKeyFor(examSessionId: string): string {
    return `grading-reference/${examSessionId}/answer-key`;
  }

  /** URL để giảng viên upload đáp án mẫu. Không đi qua NestJS (Security rule 5). */
  async requestAnswerKeyUpload(
    session: ExamSessionEntity,
  ): Promise<{ storageKey: string; uploadUrl: string; expiresIn: number }> {
    await this.assertNotGradedYet(session);
    const storageKey = this.answerKeyFor(session.id);
    const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
    return { storageKey, uploadUrl, expiresIn };
  }

  async upsert(
    session: ExamSessionEntity,
    dto: UpsertGradingReferenceDto,
    teacherId: string,
    /** Ai đưa đáp án của LƯỢT GHI này (§14.1). Route của giảng viên để mặc định. */
    origin: ModelAnswerOrigin = 'teacher',
  ): Promise<GradingReferenceEntity> {
    await this.assertNotGradedYet(session);

    if (dto.questionMaterialId) {
      // Scoped theo phiên, có chủ đích: một id hợp lệ CỦA PHIÊN KHÁC phải
      // đọc là "không tìm thấy", không phải là file của người khác.
      const material = await this.materials.findOne({
        where: { id: dto.questionMaterialId, examSessionId: session.id },
      });
      if (!material) {
        throw new BadRequestException(
          'Tài liệu được chọn làm đề bài không thuộc phiên thi này.',
        );
      }
    }

    if (dto.modelAnswerStorageKey) {
      const expected = this.answerKeyFor(session.id);
      if (dto.modelAnswerStorageKey !== expected) {
        // Không cho client tự đặt khoá: một khoá tuỳ ý sẽ cho phép trỏ
        // bản ghi này vào bất kỳ object nào trong bucket.
        throw new BadRequestException('Khoá lưu trữ đáp án mẫu không hợp lệ.');
      }
      if (!(await this.storage.objectExists(expected))) {
        throw new BadRequestException(
          'Chưa thấy file đáp án mẫu trên kho lưu trữ — hãy upload trước khi xác nhận.',
        );
      }
    }

    const existing = await this.references.findOne({
      where: { examSessionId: session.id },
    });

    // `undefined` (không gửi) giữ nguyên; `null` (gửi rõ) XOÁ.
    //
    // Dùng `??` cho cả hai sẽ gộp chúng làm một và giảng viên đổi được
    // lựa chọn nhưng không bỏ được: chọn nhầm file làm đề thì thay được,
    // còn "thôi không dùng đề nữa" thì không có đường nào. Phân biệt hai
    // ca này tốn đúng một phép so sánh.
    const keep = <T>(sent: T | null | undefined, current: T | null | undefined): T | null =>
      sent === undefined ? (current ?? null) : sent;

    const row = this.references.create({
      ...(existing ?? {}),
      examSessionId: session.id,
      questionMaterialId: keep(dto.questionMaterialId, existing?.questionMaterialId),
      modelAnswerStorageKey: keep(dto.modelAnswerStorageKey, existing?.modelAnswerStorageKey),
      modelAnswerFilename: keep(dto.modelAnswerFilename, existing?.modelAnswerFilename),
      modelAnswerNote: keep(dto.modelAnswerNote, existing?.modelAnswerNote),
      // KHÔNG dùng `keep`: cờ này gắn với CHÍNH đáp án đang nằm ở đây, nên nó
      // phải đi theo lượt ghi đáp án, không được thừa kế từ bản trước. Một
      // giảng viên thay đáp án chưa kiểm chứng bằng đáp án họ tự viết và
      // kiểm tay xong mà vẫn thấy cảnh báo cũ thì họ sẽ học cách phớt lờ nó.
      modelAnswerUnverified:
        dto.modelAnswerUnverified ??
        (dto.modelAnswerStorageKey !== undefined
          ? false
          : (existing?.modelAnswerUnverified ?? false)),
      createdBy: existing?.createdBy ?? teacherId,
    });
    // Nguồn gốc đi theo LƯỢT GHI ĐÁP ÁN, cùng lý do với `modelAnswerUnverified` ở trên: lượt
    // này gửi đáp án thì nguồn là người gửi; không gửi thì giữ nguồn cũ; không còn đáp án thì null.
    const answerSent = dto.modelAnswerStorageKey !== undefined || dto.modelAnswerNote !== undefined;
    const hasAnswer = Boolean(row.modelAnswerStorageKey || row.modelAnswerNote);
    row.modelAnswerOrigin = !hasAnswer ? null : answerSent ? origin : (existing?.modelAnswerOrigin ?? origin);
    return this.references.save(row);
  }

  /**
   * Đóng băng khi đã chấm — cùng luật với `setSessionRubric`, spec §2.3 luật 6.
   *
   * 20 bài đầu chấm có đáp án mẫu, 20 bài sau chấm với đáp án đã sửa, là
   * hai kỳ thi khác nhau đội lốt một. Khoá khi phiên có bài MANG ĐIỂM hoặc
   * ĐANG CHẤM; phiên mà mọi kết quả là bài không chấm được đã dừng thì mở
   * lại, vì chưa bài nào bị đo bằng thước cũ — trước luật này, có một dòng
   * kết quả là khoá, và một lần sandbox sập làm cả phiên kẹt vĩnh viễn.
   */
  private async assertNotGradedYet(session: ExamSessionEntity): Promise<void> {
    // Gọi `isGradingLocked` (hàm tự do) thay vì `GradingService`: chiều ngược lại đã
    // tồn tại — `GradingService.gradeOne` gọi `loadForGrading` của file này. Hai
    // service cùng module import nhau là phụ thuộc vòng, thứ CLAUDE.md cấm thẳng —
    // và dưới CommonJS nó không nổ, nó chỉ cho ra `undefined` ở một chỗ không ai ngờ.
    //
    // Đặt guard ở SERVICE chứ không ở controller, dù controller có tiền
    // lệ (`setSessionRubric`): guard ở controller là guard mà đường gọi
    // tương lai đi vòng qua được.
    if (await isGradingLocked(this.results.manager, session.id)) {
      throw new ConflictException(
        `${GRADING_LOCKED_MESSAGE} — không đổi được tài liệu tham chiếu nữa.`,
      );
    }
  }

  async readiness(examSessionId: string): Promise<GradingReadiness> {
    const row = await this.references.findOne({ where: { examSessionId } });
    const hasQuestion = Boolean(row?.questionMaterialId);
    const hasModelAnswer = Boolean(row?.modelAnswerStorageKey || row?.modelAnswerNote);

    if (!hasQuestion) {
      return {
        level: 'rubric_only',
        hasQuestion,
        hasModelAnswer,
        warning:
          'Chưa chọn đề bài — AI chỉ đối chiếu rubric và KHÔNG phát hiện được ' +
          'bài làm đúng theo hướng khác.',
      };
    }
    if (!hasModelAnswer) {
      return {
        level: 'with_question',
        hasQuestion,
        hasModelAnswer,
        warning: 'Chưa có đáp án mẫu — AI đánh giá theo đề, chưa biết cách chấm của thầy.',
      };
    }
    return { level: 'with_model_answer', hasQuestion, hasModelAnswer, warning: null };
  }

  /**
   * Nạp tài liệu để ghép vào prompt.
   *
   * Trả về rỗng chứ không ném khi phiên chưa có tài liệu: chấm ở mức 1 là
   * hợp lệ (xem `readiness`), chỉ là kém hơn — và chặn ở đây sẽ biến một
   * sự suy giảm đã báo trước thành một lỗi chặn đường.
   *
   * Một file đọc không được cũng không ném: mất đáp án mẫu làm bài chấm
   * kém đi, nhưng không chấm gì cả thì tệ hơn.
   */
  async loadForGrading(examSessionId: string): Promise<LoadedGradingReference> {
    const row = await this.references.findOne({
      where: { examSessionId },
      relations: { questionMaterial: true },
    });
    if (!row) {
      return { loadedLevel: 'rubric_only' };
    }

    const loaded: LoadedGradingReference = {
      note: row.modelAnswerNote ?? undefined,
      loadedLevel: 'rubric_only',
    };

    if (row.questionMaterial) {
      try {
        loaded.questionPdf = await this.storage.getObject(row.questionMaterial.storageKey);
        loaded.questionFilename = row.questionMaterial.fileName;
      } catch (error) {
        this.logger.warn(
          `session ${examSessionId}: không đọc được đề bài — chấm tiếp không có nó: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (row.modelAnswerStorageKey) {
      try {
        loaded.modelAnswer = await this.storage.getObject(row.modelAnswerStorageKey);
        loaded.modelAnswerFilename = row.modelAnswerFilename ?? undefined;
      } catch (error) {
        this.logger.warn(
          `session ${examSessionId}: không đọc được đáp án mẫu — chấm tiếp không có nó: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Mức tính từ thứ THẬT SỰ nạp được, không phải từ thứ đã cấu hình.
    if (loaded.questionPdf) {
      loaded.loadedLevel = loaded.modelAnswer || loaded.note ? 'with_model_answer' : 'with_question';
    }

    const configured = await this.readiness(examSessionId);
    if (configured.level !== loaded.loadedLevel) {
      // Không ném: mất một tài liệu làm bài chấm kém đi, nhưng không chấm
      // gì cả thì tệ hơn. Nhưng KHÔNG ĐƯỢC im lặng — đây đúng là ca mà
      // giảng viên thấy "đủ tài liệu" trước khi bấm rồi lượt chấm chạy ở
      // mức thấp hơn mà không ai biết.
      this.logger.error(
        `session ${examSessionId}: NGỮ CẢNH SUY GIẢM — cấu hình ở mức ` +
          `"${configured.level}" nhưng chỉ nạp được "${loaded.loadedLevel}". ` +
          'Kiểm tra file trên kho lưu trữ.',
      );
    }

    return loaded;
  }
}
