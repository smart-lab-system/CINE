import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { ExamMaterialEntity } from '../exam-session/entities/exam-material.entity';
import { StorageService } from '../storage/storage.service';
import { GradingReferenceEntity } from './entities/grading-reference.entity';
import { GradingResultEntity } from './entities/grading-result.entity';
import { UpsertGradingReferenceDto } from './dto/upsert-grading-reference.dto';
import type { ModelAnswerOrigin } from './grading-model.types';
import { GRADING_LOCKED_MESSAGE, isGradingLocked } from './grading-lock';
import { ensureDefaultProblem, resolveProblemConfig } from './problem/resolve-problem-config';
import { assertSessionRouteAllowed } from './problem/session-route-guard';

/**
 * Mã nguồn đáp án mẫu đã nằm trên kho theo băm nội dung. Đi qua THAM SỐ của service, không qua HTTP DTO:
 * một client tự đặt được khoá này là trỏ được bản ghi vào object bất kỳ trong bucket.
 */
export interface AnswerSource {
  key: string;
  sha256: string;
}

/** Trần kích thước mã đáp án khi giảng viên tải lên. Một lời giải thật chỉ vài KB; trần này chặn upload bậy. */
export const ANSWER_SOURCE_MAX_BYTES = 256 * 1024;

/**
 * Ba mức ngữ cảnh mà hệ thống có thể chấm với.
 *
 * Mức 1 là mức hệ thống chạy hôm nay — ÂM THẦM. Không cấm nó, nhưng không
 * để nó im lặng: một giảng viên chấm ở mức 1 mà tin mình đang ở mức 3 sẽ
 * để lọt đúng những em mà tính năng này sinh ra để bảo vệ.
 */
export type GradingReadinessLevel = 'rubric_only' | 'with_question' | 'with_model_answer';

/**
 * Một tài liệu chấm và nó đến từ đâu. `present: false` thì UI bỏ cả dòng —
 * không có tài liệu thì không có nguồn để nói.
 */
export interface GradingSourceInfo {
  present: boolean;
  /**
   * `teacher_upload` = giảng viên tự đưa vào (kể cả một câu ghi chú).
   * `authoring` = do luồng soạn đề sinh ra rồi gắn vào (cả `origin='generated'`:
   * mô hình viết, không phải tay giảng viên — đó là điều màn này cần nói).
   */
  kind: 'teacher_upload' | 'authoring';
  fileName: string | null;
  /** ISO-8601, hoặc `null` khi không đo được. */
  setAt: string | null;
}

export interface GradingReadiness {
  level: GradingReadinessLevel;
  /** `null` khi đủ tài liệu. Chuỗi này để UI hiện nguyên văn. */
  warning: string | null;
  hasQuestion: boolean;
  hasModelAnswer: boolean;
  /**
   * Phiên đã có MÃ NGUỒN đáp án mẫu (để chạy thử và sinh gói từ đáp án). KHÁC `hasModelAnswer`: mã là thứ máy chạy bài chạy, không
   * phải tài liệu AI chấm đọc, nên không được tính vào mức ngữ cảnh `level`.
   */
  hasAnswerSource: boolean;
  /**
   * Nguyên văn ghi chú đáp án đã lưu. `null` khi không có, hoặc chỉ toàn khoảng trắng.
   * Không kèm storage key và không kèm nội dung file đáp án.
   */
  modelAnswerNote: string | null;
  sources: {
    question: GradingSourceInfo;
    modelAnswer: GradingSourceInfo & { unverified: boolean };
  };
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

/** Hàng này có đáp án mẫu nào không: tài liệu, ghi chú, hay mã nguồn. */
const hasAnyAnswer = (ref: GradingReferenceEntity | null | undefined): boolean =>
  Boolean(ref?.modelAnswerStorageKey || ref?.modelAnswerNote || ref?.modelAnswerSourceKey);

/**
 * Đáp án hiện tại là của giảng viên? Có đáp án mà không rõ nguồn (dòng cũ trước khi có cột nguồn gốc) coi là của giảng viên: thà
 * chặn nhầm một lượt sinh còn hơn ghi đè một đáp án người đã viết.
 */
const teacherOwnsAnswer = (ref: GradingReferenceEntity | null | undefined): boolean =>
  hasAnyAnswer(ref) && (ref?.modelAnswerOrigin ?? 'teacher') === 'teacher';

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

  /**
   * 5.3 — giảng viên xác nhận thước (§6.3b): đáp án chưa kiểm chứng được nâng lên `teacher`, và ghi ai và khi nào.
   * Idempotent: xác nhận lại trả đúng mốc lần đầu. Không có đáp án thì không có gì để xác nhận.
   */
  async confirmRuler(session: ExamSessionEntity, teacherId: string): Promise<{ confirmedAt: string }> {
    const ref = await this.references.findOne({ where: { examSessionId: session.id } });
    if (!ref || !(ref.modelAnswerStorageKey || ref.modelAnswerNote || ref.modelAnswerSourceKey)) {
      throw new BadRequestException('Chưa có đáp án mẫu để xác nhận — hãy gắn đề hoặc nhập đáp án trước.');
    }
    if (ref.rulerConfirmedAt) {
      return { confirmedAt: ref.rulerConfirmedAt.toISOString() };
    }
    const now = new Date();
    await this.references.update(
      { examSessionId: session.id },
      { modelAnswerUnverified: false, rulerTrust: 'teacher', rulerConfirmedBy: teacherId, rulerConfirmedAt: now },
    );
    return { confirmedAt: now.toISOString() };
  }

  /**
   * URL để giảng viên tải MÃ đáp án của mình lên (G2b-R Task 2). Khoá `pending-<uuid>` là chỗ tạm: `confirmAnswerSource`
   * đọc, băm, đặt nó dưới khoá theo băm rồi xoá bản tạm. Không đi qua NestJS (Security rule 5).
   */
  async requestAnswerSourceUpload(
    session: ExamSessionEntity,
    extension: 'cpp' | 'py',
  ): Promise<{ storageKey: string; uploadUrl: string; expiresIn: number }> {
    await this.assertNotGradedYet(session);
    const storageKey = `grading-reference/${session.id}/pending-${randomUUID()}.${extension}`;
    const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
    return { storageKey, uploadUrl, expiresIn };
  }

  /**
   * Chốt mã đáp án đã tải lên: server đọc object, băm, ghi lại dưới khoá theo băm (nếu chưa có), đặt cột nguồn và xoá
   * bản tạm. Mã của giảng viên chưa từng được chạy nên thước ở mức `unverified` tới khi họ xác nhận (`confirmRuler`),
   * và xác nhận cũ không còn áp dụng cho mã mới. Idempotent theo nội dung: cùng mã thì cùng khoá.
   */
  async confirmAnswerSource(
    session: ExamSessionEntity,
    teacherId: string,
    storageKey: string,
  ): Promise<{ sourceKey: string; sha256: string }> {
    await this.assertNotGradedYet(session);

    // Chỉ nhận khoá pending của CHÍNH phiên này: một khoá tuỳ ý sẽ cho phép trỏ bản ghi vào object bất kỳ trong bucket.
    const pending = new RegExp(`^grading-reference/${session.id}/pending-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(cpp|py)$`).exec(storageKey);
    if (!pending) {
      throw new BadRequestException('Khoá mã đáp án tạm không hợp lệ.');
    }
    const size = await this.storage.getObjectSize(storageKey);
    if (size === null) {
      throw new BadRequestException('Chưa thấy file mã đáp án trên kho lưu trữ — hãy tải lên trước khi xác nhận.');
    }
    // Trần kích thước TRƯỚC khi đọc vào bộ nhớ: presigned URL không giới hạn dung lượng upload.
    if (size > ANSWER_SOURCE_MAX_BYTES) {
      throw new BadRequestException(`Mã đáp án quá lớn (${size} byte, tối đa ${ANSWER_SOURCE_MAX_BYTES}).`);
    }

    const bytes = await this.storage.getObject(storageKey);
    // Máy chạy bài đọc mã như văn bản UTF-8. Mã lưu ở bảng mã khác (CP1258/ANSI, UTF-16) xác nhận được rồi mọi lượt chạy
    // sau đó giải mã ra chữ khác với byte đã băm: báo "không khớp băm" mãi mãi. Từ chối ngay đây, nói rõ cách sửa.
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new BadRequestException('Mã đáp án phải lưu ở dạng UTF-8 (hãy "Save with Encoding → UTF-8" trong trình soạn thảo rồi tải lại).');
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const sourceKey = `grading-reference/${session.id}/source-${sha256}.${pending[1]}`;
    if (!(await this.storage.objectExists(sourceKey))) {
      await this.storage.putObject(sourceKey, bytes, 'text/plain; charset=utf-8');
    }

    await this.references.manager.transaction((m) =>
      this.writeSourceRow(m, session, teacherId, { key: sourceKey, sha256 }, { origin: 'teacher', trust: 'unverified' }),
    );

    // Bản tạm xoá SAU khi DB đã ghi: hỏng ở bước này chỉ để lại một object mồ côi, không mất mã của giảng viên.
    await this.storage.deleteObject(storageKey).catch((error: unknown) => {
      this.logger.warn(`Không xoá được object tạm ${storageKey}: ${error instanceof Error ? error.message : String(error)}`);
    });
    return { sourceKey, sha256 };
  }

  /**
   * Ghi mã đáp án do HỆ THỐNG sinh (G2b-R Task 3), trong transaction của NGƯỜI GỌI (cùng gói và dòng chạy). Độ tin cậy do
   * bước kiểm ví dụ trong đề quyết: `verified` khi đáp án chạy thật tái tạo đúng mọi ví dụ, `unverified` khi đề không có
   * ví dụ. Origin là `generated`, KHÔNG phải `teacher`: đáp án này chưa có người nào xác nhận.
   */
  async writeGeneratedSource(
    m: EntityManager,
    session: ExamSessionEntity,
    teacherId: string,
    source: AnswerSource,
    trust: 'verified' | 'unverified',
  ): Promise<void> {
    await this.assertNotGradedYet(session);
    await this.assertAnswerSource(session, source);
    await this.writeSourceRow(m, session, teacherId, source, { origin: 'generated', trust });
  }

  /**
   * Khoá theo băm phải đúng tiền tố của PHIÊN NÀY: khoá của phiên khác, hay băm khai báo không khớp băm trong khoá, đều
   * là lời khai sai. Và object phải có thật trên kho. Kiểm TRƯỚC transaction, cùng chỗ với kiểm khoá đáp án.
   */
  private async assertAnswerSource(session: ExamSessionEntity, source: AnswerSource): Promise<void> {
    const match = new RegExp(`^grading-reference/${session.id}/source-([0-9a-f]{64})\\.(cpp|py)$`).exec(source.key);
    if (!match || match[1] !== source.sha256) {
      throw new BadRequestException('Khoá mã nguồn đáp án không hợp lệ.');
    }
    if (!(await this.storage.objectExists(source.key))) {
      throw new BadRequestException('Chưa thấy mã nguồn đáp án trên kho lưu trữ.');
    }
  }

  /**
   * Đặt cột nguồn và những gì đi theo một đáp án MỚI: nguồn gốc, mốc thời gian, cờ chưa kiểm chứng, `ruler_trust`, và xoá
   * xác nhận thước cũ (đáp án mới thì chưa ai xác nhận nó). Cùng cổng với `upsert`: phiên nhiều câu không sửa tài liệu cấp phiên.
   */
  private async writeSourceRow(
    m: EntityManager,
    session: ExamSessionEntity,
    teacherId: string,
    source: AnswerSource,
    o: { origin: ModelAnswerOrigin; trust: 'verified' | 'unverified' },
  ): Promise<void> {
    await assertSessionRouteAllowed(m, session.id);
    const refs = m.getRepository(GradingReferenceEntity);
    // Đọc SAU khi `assertSessionRouteAllowed` đã giữ khoá giảng viên: route lưu đáp án và route xác nhận mã cũng lấy khoá đó, nên
    // không có lượt lưu nào của giảng viên chen giữa lúc đọc này và lúc ghi bên dưới.
    const existing = await refs.findOne({ where: { examSessionId: session.id } });
    // Lượt sinh kéo dài cả phút (model, hai lượt chạy). Giảng viên có thể lưu đáp án của mình trong lúc đó; kiểm ở đầu lượt không
    // đủ — ghi đè lúc này là gắn nhãn `generated` lên đáp án họ vừa viết và mất con trỏ tới mã của họ (spec §3 luật 6).
    if (o.origin === 'generated' && teacherOwnsAnswer(existing)) {
      throw new ConflictException(
        'Giảng viên vừa lưu đáp án mẫu của mình trong lúc hệ thống đang sinh — không ghi đè. Hãy dùng "Sinh gói test từ đáp án của bạn" nếu muốn sinh gói từ đáp án đó.',
      );
    }
    const row = refs.create({ ...(existing ?? {}), examSessionId: session.id, createdBy: existing?.createdBy ?? teacherId });
    // Đáp án cũ do HỆ THỐNG viết (soạn đề hay sinh trước đó) bị thay TRỌN: ghi chú, tài liệu và tên file của nó thuộc về đáp án cũ.
    // Để lại thì hàng này nói "nguồn gốc mới, độ tin cậy mới" mà vẫn đưa cho bộ chấm tài liệu của một chương trình khác. Đáp án
    // của giảng viên thì ở lại (họ chỉ thêm mã vào).
    if (existing?.modelAnswerOrigin && existing.modelAnswerOrigin !== 'teacher') {
      row.modelAnswerStorageKey = null;
      row.modelAnswerFilename = null;
      row.modelAnswerNote = null;
    }
    row.modelAnswerSourceKey = source.key;
    row.modelAnswerSourceSha256 = source.sha256;
    row.modelAnswerOrigin = o.origin;
    row.modelAnswerSetAt = new Date();
    row.modelAnswerUnverified = o.trust === 'unverified';
    row.rulerTrust = o.trust;
    row.rulerConfirmedBy = null;
    row.rulerConfirmedAt = null;
    row.problemId = existing?.problemId ?? (await ensureDefaultProblem(m, session.id));
    await refs.save(row);
  }

  /**
   * Mã nguồn đáp án mẫu hiện hành của phiên (G2b A2b), hoặc null khi phiên chưa có (phiên cũ, đáp án là docx hay ghi chú).
   * Chỉ trả khoá và băm, không trả nội dung: người gọi tự đọc kho khi cần, và không route nào được phát nó cho client.
   */
  async getAnswerSource(sessionId: string): Promise<AnswerSource | null> {
    const ref = await this.references.findOne({ where: { examSessionId: sessionId } });
    return ref?.modelAnswerSourceKey && ref.modelAnswerSourceSha256
      ? { key: ref.modelAnswerSourceKey, sha256: ref.modelAnswerSourceSha256 }
      : null;
  }

  /**
   * Phiên đã có đáp án mẫu chưa, và ai đưa nó (G2b-R Task 3). Chỉ để lượt sinh thước biết nó có được ghi đè không: đáp án
   * của giảng viên thì không (spec §3 luật 6). Đáp án có mà không rõ nguồn (dòng cũ trước khi có cột nguồn gốc) được coi
   * là của giảng viên — thà chặn nhầm một lượt sinh còn hơn ghi đè một đáp án người đã viết.
   */
  async answerState(sessionId: string): Promise<{ hasAnswer: boolean; teacherOwned: boolean }> {
    const ref = await this.references.findOne({ where: { examSessionId: sessionId } });
    return { hasAnswer: hasAnyAnswer(ref), teacherOwned: teacherOwnsAnswer(ref) };
  }

  async upsert(
    session: ExamSessionEntity,
    dto: UpsertGradingReferenceDto,
    teacherId: string,
    /** Ai đưa đáp án của LƯỢT GHI này (§14.1). Route của giảng viên để mặc định. */
    origin: ModelAnswerOrigin = 'teacher',
    /** Chỉ luồng gắn đề lại (5.4) đặt: đã tự kiểm số câu, điểm và trạng thái trước khi ghi, nên không chạy cổng route. */
    bypassRouteGuard = false,
    /** Mã nguồn của đáp án trong lượt ghi này (G2b A2b). Có thì kiểm khuôn khoá, băm và sự tồn tại trên kho. */
    answerSource: AnswerSource | null = null,
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

    if (answerSource !== null) await this.assertAnswerSource(session, answerSource);

    return this.references.manager.transaction(async (m) => {
      // Guard TRONG transaction của lượt ghi: khoá giảng viên và hàng phiên giữ tới khi ghi xong, nên một lượt
      // thêm câu đồng thời không chen vào giữa lúc kiểm và lúc ghi (P1b).
      if (!bypassRouteGuard) {
        await assertSessionRouteAllowed(m, session.id);
      }
      const refs = m.getRepository(GradingReferenceEntity);

      const existing = await refs.findOne({
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

      const row = refs.create({
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
      // Mã nguồn đi theo lượt ghi đáp án như nguồn gốc: lượt này kèm mã thì đặt; gửi đáp án mà không kèm mã thì
      // XOÁ (mã cũ không còn thuộc đáp án mới); không gửi đáp án thì giữ nguyên.
      // NGOẠI LỆ: giảng viên sửa đáp án CỦA CHÍNH MÌNH (origin teacher, đáp án đang là teacher) thì mã của họ ở lại, trừ khi
      // họ xoá CẢ khoá LẪN ghi chú (đáp án không còn gì). Form chỉ gửi ghi chú khi đổi nó, nên xoá ghi chú không được kéo theo mã:
      // mã vẫn là đáp án và mọi lượt chạy thử sau đó sẽ báo "chưa có mã". Mã do hệ thống sinh thì không bao giờ ở lại dưới nhãn teacher.
      const clearsWholeAnswer = dto.modelAnswerStorageKey === null && dto.modelAnswerNote === null;
      const teacherEditsOwnAnswer =
        answerSource === null && origin === 'teacher' && existing?.modelAnswerOrigin === 'teacher' && !clearsWholeAnswer;
      const keepSource = !answerSent || teacherEditsOwnAnswer;
      row.modelAnswerSourceKey = answerSource?.key ?? (keepSource ? (existing?.modelAnswerSourceKey ?? null) : null);
      row.modelAnswerSourceSha256 = answerSource?.sha256 ?? (keepSource ? (existing?.modelAnswerSourceSha256 ?? null) : null);
      // Mã nguồn cũng là một đáp án (giảng viên có thể chỉ tải mã lên — G2b-R Task 2), nên cũng giữ nguồn gốc của nó.
      const hasAnswer = Boolean(row.modelAnswerStorageKey || row.modelAnswerNote || row.modelAnswerSourceKey);
      row.modelAnswerOrigin = !hasAnswer ? null : answerSent ? origin : (existing?.modelAnswerOrigin ?? origin);
      // Dấu thời gian đi CÙNG nhịp với nguồn gốc: cả hai trả lời "đáp án của bản ghi này đến từ đâu, từ lúc nào".
      row.modelAnswerSetAt = !hasAnswer ? null : answerSent ? new Date() : (existing?.modelAnswerSetAt ?? new Date());
      // Câu và độ tin cậy của thước (P1a): giữ câu đã có; thước theo đúng quy tắc backfill M2.
      row.problemId = existing?.problemId ?? (await ensureDefaultProblem(m, session.id));
      // `verified` (hệ thống chạy đáp án tái tạo đúng ví dụ trong đề) do lượt sinh ghi; một lượt chỉ chọn lại đề KHÔNG được
      // hạ nó thành `teacher` (mức cao hơn: giảng viên đã xác nhận). Gửi đáp án mới thì mọi xác nhận cũ hết hiệu lực.
      row.rulerTrust = row.modelAnswerUnverified ? 'unverified' : !answerSent && existing?.rulerTrust === 'verified' ? 'verified' : 'teacher';
      // 5.3: đổi đáp án thì xác nhận cũ không còn áp dụng cho đáp án mới — xoá để không ghi "ai xác nhận" sai đáp án.
      row.rulerConfirmedBy = answerSent ? null : (existing?.rulerConfirmedBy ?? null);
      row.rulerConfirmedAt = answerSent ? null : (existing?.rulerConfirmedAt ?? null);
      return refs.save(row);
    });
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
  async assertNotGradedYet(session: ExamSessionEntity): Promise<void> {
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
    // `relations`: dòng nguồn của ĐỀ cần tên file và lúc tải lên, mà cả hai nằm ở `exam_material`.
    const row = await this.references.findOne({
      where: { examSessionId },
      relations: { questionMaterial: true },
    });
    const hasQuestion = Boolean(row?.questionMaterialId);
    const hasModelAnswer = Boolean(row?.modelAnswerStorageKey || row?.modelAnswerNote);
    const hasAnswerSource = Boolean(row?.modelAnswerSourceKey);
    const modelAnswerNote = row?.modelAnswerNote && row.modelAnswerNote.trim() !== '' ? row.modelAnswerNote : null;
    const sources: GradingReadiness['sources'] = {
      question: {
        present: hasQuestion,
        // Đề luôn do giảng viên tự tải lên: `ExamMaterialService.requestUpload` là đường duy nhất tạo `exam_material`.
        kind: 'teacher_upload',
        fileName: row?.questionMaterial?.fileName ?? null,
        setAt: row?.questionMaterial?.uploadedAt?.toISOString() ?? null,
      },
      modelAnswer: {
        present: hasModelAnswer,
        // `'generated'` cũng là "không phải tay giảng viên" — chưa có đường nào đặt nó, nhưng khi có thì đọc vẫn đúng.
        kind:
          row?.modelAnswerOrigin === 'authoring' || row?.modelAnswerOrigin === 'generated'
            ? 'authoring'
            : 'teacher_upload',
        fileName: row?.modelAnswerFilename ?? null,
        setAt: row?.modelAnswerSetAt?.toISOString() ?? null,
        unverified: row?.modelAnswerUnverified ?? false,
      },
    };

    if (!hasQuestion) {
      return {
        level: 'rubric_only',
        hasQuestion,
        hasModelAnswer,
        hasAnswerSource,
        modelAnswerNote,
        sources,
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
        hasAnswerSource,
        modelAnswerNote,
        sources,
        warning: 'Chưa có đáp án mẫu — AI đánh giá theo đề, chưa biết cách chấm của thầy.',
      };
    }
    return {
      level: 'with_model_answer',
      hasQuestion,
      hasModelAnswer,
      hasAnswerSource,
      modelAnswerNote,
      sources,
      warning: null,
    };
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
    // Đọc tham chiếu của CÂU MẶC ĐỊNH (P1a); không có cấu hình thì đọc như cũ theo phiên. problem_id rỗng
    // (dòng ghi thẳng SQL, không qua upsert) được coi là câu mặc định, như backfill M2 làm.
    const cfg = await resolveProblemConfig(this.references.manager, examSessionId);
    const row = await this.references.findOne({
      where: cfg
        ? [{ examSessionId, problemId: cfg.problemId }, { examSessionId, problemId: IsNull() }]
        : { examSessionId },
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
