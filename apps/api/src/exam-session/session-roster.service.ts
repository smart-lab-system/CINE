import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { ClassEntity } from '../course/entities/class.entity';
import { EnrollmentEntity } from '../course/entities/enrollment.entity';
import { RequiredDeliverableEntity } from './entities/required-deliverable.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { SessionRosterEntity } from './entities/session-roster.entity';
import { isExamOver } from './exam-session.types';

export interface FreezeResult {
  students: number;
  submissionsSeeded: number;
}

/**
 * Số dòng mỗi lần INSERT.
 *
 * Danh sách gieo là TÍCH sinh viên × deliverable, nên nó lớn nhanh hơn
 * trực giác: 200 sinh viên × 3 file = 600 dòng trong một câu lệnh, mỗi
 * dòng kiểm ba khoá ngoại RESTRICT. Ở quy mô đồ án thì không nổ, nhưng
 * một tham số loại bỏ hẳn class lỗi này thay vì để nó chờ.
 */
const INSERT_CHUNK = 100;

/**
 * Đóng băng danh sách dự thi (CLAUDE.md §7.1.1) và gieo chỗ ngồi cho sự
 * vắng mặt (§7.1.2).
 *
 * MỘT transaction: ảnh chốt và các dòng `not_submitted` phải cùng tồn
 * tại hoặc cùng không. Một ảnh chốt không có dòng submission nào để lại
 * đúng cái lỗ mà §7.1.2 sinh ra để bịt.
 */
@Injectable()
export class SessionRosterService {
  private readonly logger = new Logger(SessionRosterService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Ảnh chốt đã có chưa — `agent:join` hỏi câu này trước khi cho vào. */
  async isFrozen(examSessionId: string): Promise<boolean> {
    const count = await this.dataSource
      .getRepository(SessionRosterEntity)
      .count({ where: { examSessionId } });
    return count > 0;
  }

  /**
   * Một dòng của ảnh chốt, hoặc null — câu hỏi "em này có được ngồi phiên
   * NÀY không".
   *
   * `agent:join` hỏi ảnh chốt chứ không hỏi `enrollment`, và khác biệt đó
   * quan trọng đúng ở ca thi bù. Duyệt một yêu cầu xin phép ghi enrollment
   * theo lớp GỐC của sinh viên (để định tuyến bài nộp đúng người dạy), nên
   * hỏi "em có enrollment ở lớp của phiên không" sẽ từ chối chính người
   * giám thị vừa cho vào. Ảnh chốt là danh sách đã tính cả hai đường: lúc
   * mở phiên nó chụp enrollment của lớp, và mỗi lượt duyệt thêm một dòng.
   *
   * `student_mssv` là `citext`, nên phép so khớp không phân biệt hoa
   * thường — điều đó do KIỂU CỘT quyết định, không phải do code ở đây.
   */
  async findEntry(
    examSessionId: string,
    studentMssv: string,
  ): Promise<SessionRosterEntity | null> {
    return this.dataSource
      .getRepository(SessionRosterEntity)
      .findOne({ where: { examSessionId, studentMssv } });
  }

  async freeze(session: ExamSessionEntity): Promise<FreezeResult> {
    if (!session.classId) {
      // Phiên tạo trước khi `class_id` tồn tại (nullable vì lý do lịch
      // sử — xem comment trên cột). Không có lớp thì không có danh sách
      // kỳ vọng để chụp.
      throw new BadRequestException(
        'Phiên thi này không gắn lớp nào nên không có danh sách dự thi để chốt.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const rosterRepo = manager.getRepository(SessionRosterEntity);

      const already = await rosterRepo.count({ where: { examSessionId: session.id } });
      if (already > 0) {
        // Idempotent: bấm hai lần không phải lỗi, và KHÔNG được chốt
        // lại — chốt lại nghĩa là ảnh chốt đi theo roster hiện tại, tức
        // mất đúng tính chất khiến nó có giá trị.
        return { students: already, submissionsSeeded: 0 };
      }

      const enrolled = await manager.getRepository(EnrollmentEntity).find({
        where: { homeClassId: session.classId },
      });
      if (enrolled.length === 0) {
        // Vế thứ hai không thừa. Guard này đúng cho ca thường (mở phiên
        // trước khi nhập roster là lỗi thật) và SAI cho ca hiếm: phiên
        // chỉ dành cho thi bù, lớp cố ý rỗng, người dự thi đều thêm tay.
        // Ca hiếm ấy cần một cờ trên phiên để phân biệt "rỗng do quên"
        // với "rỗng có chủ đích" — tức chạm vòng đời, tức thuộc spec
        // `scheduled`. Cho tới lúc đó, nói thẳng là CHƯA HỖ TRỢ: người
        // gặp nó mà chỉ đọc vế đầu sẽ đi tìm một roster không tồn tại
        // rồi kết luận hệ thống hỏng.
        throw new BadRequestException(
          'Lớp của phiên thi này chưa có sinh viên nào trong danh sách — hãy nhập roster trước khi mở phiên. ' +
            'Nếu đây là phiên thi bù không có lớp cố định, tính năng này chưa được hỗ trợ.',
        );
      }

      await this.insertChunked(
        rosterRepo,
        enrolled.map((row) => ({
          examSessionId: session.id,
          studentMssv: row.studentMssv,
          studentName: row.studentName,
          homeClassId: row.homeClassId,
          homeTeacherId: row.homeTeacherId,
          source: 'frozen' as const,
        })),
      );

      const seeded = await this.seedSeats(
        manager,
        session.id,
        enrolled.map((row) => ({
          mssv: row.studentMssv,
          name: row.studentName,
          homeClassId: row.homeClassId,
          homeTeacherId: row.homeTeacherId,
        })),
      );

      this.logger.log(
        `session ${session.id}: chốt ${enrolled.length} sinh viên, gieo ${seeded} dòng chưa nộp`,
      );
      return { students: enrolled.length, submissionsSeeded: seeded };
    });
  }

  /**
   * Thêm một sinh viên vào ảnh chốt tại phòng thi — đường thoát hiểm
   * §5.8, mà §7.1.1 đánh dấu "bắt buộc giữ".
   *
   * GIEO chỗ ngồi như `freeze`, không chỉ ghi ảnh chốt. Lý do cũ ở đây —
   * "em vào muộn sẽ nộp bằng đường thường, `writeCollected` tự tạo
   * dòng" — chỉ đúng cho em CÓ nộp. Em được thêm tay rồi không nộp gì
   * thì không có dòng nào, nên không bị `markAbsentees` đụng tới, không
   * có mặt trong bảng điểm, và không xuất hiện ở bất kỳ phép đếm nào:
   * đúng lỗ hổng §7.1.2 vừa bịt, chỉ khác đường vào.
   *
   * Nỗi lo đua với em đang nộp là không có thật: `writeCollected` dắt
   * một dòng `not_submitted`/`absent` có sẵn qua `received → validated →
   * collected` (submission.service.ts) thay vì đâm vào nó.
   */
  async addManually(
    session: ExamSessionEntity,
    student: { mssv: string; name: string },
  ): Promise<SessionRosterEntity> {
    if (isExamOver(session.status)) {
      // Cùng nguyên tắc route "Thu lại" đã đặt (spec collecting §6.5):
      // thêm người vào danh sách dự thi của một buổi thi đã hết giờ là
      // ghi một điều không xảy ra.
      throw new ConflictException(
        'Phiên thi đã kết thúc — không thêm được sinh viên vào danh sách dự thi nữa.',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const rosterRepo = manager.getRepository(SessionRosterEntity);
      const existing = await rosterRepo.findOne({
        where: { examSessionId: session.id, studentMssv: student.mssv },
      });
      if (existing) {
        // Bắt ở đây thay vì để `uq_session_roster_session_student` ném
        // 23505: PostgresExceptionFilter map được nó thành 409, nhưng
        // thông điệp sẽ nói về một chỉ mục thay vì về sinh viên.
        throw new ConflictException(
          `Sinh viên ${student.mssv} đã có trong danh sách dự thi của phiên này.`,
        );
      }

      // Lớp GỐC của em, trong phạm vi MÔN của phiên này.
      //
      // Không khoá vào `session.classId`: sinh viên thi bù có enrollment ở
      // lớp khác, và giữ đúng lớp gốc là toàn bộ điểm của phép định tuyến ở
      // §3.3. Nhưng cũng không được hỏi trống: khoá duy nhất giờ là
      // (home_class_id, student_mssv), nên một sinh viên có NHIỀU dòng
      // enrollment ở nhiều môn, và một câu `findOne` không phạm vi sẽ trả
      // về dòng nào tuỳ thứ tự DB — bài của em bị định tuyến sang một
      // giảng viên chưa từng dạy môn này. Trước đợt thu hẹp master data
      // phép tra này khoá theo `course_id`; bản dịch đúng là khoá theo TÊN
      // môn, qua các lớp anh em.
      //
      // Tên môn nay là hằng số, nên vế này khớp mọi lớp và thứ thật sự chọn
      // ra một dòng là ORDER BY bên dưới. Giữ vế lọc: nó vô hại, và nó là
      // chỗ duy nhất ghi lại rằng phép tra này CÓ phạm vi theo môn.
      const enrollment = await manager
        .getRepository(EnrollmentEntity)
        .createQueryBuilder('e')
        .innerJoin(ClassEntity, 'c', 'c.id = e.home_class_id')
        .where('e.student_mssv = :mssv', { mssv: student.mssv })
        .andWhere('c.course_name = :courseName', { courseName: session.courseName })
        // Một sinh viên VẪN có thể có nhiều dòng trong cùng một môn — khoá
        // duy nhất là (home_class_id, student_mssv), nên chuyển lớp giữa kỳ
        // để lại hai dòng. Không có ORDER BY thì Postgres trả dòng nào là
        // tuỳ, và có thể ĐỔI sau một lần VACUUM: cùng một thao tác cho hai
        // kết quả khác nhau ở hai thời điểm. Lấy dòng MỚI NHẤT — lần ghi
        // danh gần đây nhất là câu trả lời đúng cho 'em đang ở lớp nào'.
        .orderBy('e.created_at', 'DESC')
        .getOne();

      // Em có enrollment (thi bù lớp khác) thì giữ lớp/GV GỐC của họ —
      // định tuyến ở §3.3. Không có enrollment nào thì họ thuộc lớp của
      // phiên này.
      const homeClassId = enrollment?.homeClassId ?? session.classId;
      const homeTeacherId = enrollment?.homeTeacherId ?? session.teacherId;

      const saved = await rosterRepo.save(
        rosterRepo.create({
          examSessionId: session.id,
          studentMssv: student.mssv,
          studentName: student.name,
          homeClassId,
          homeTeacherId,
          source: 'manual',
        }),
      );

      await this.seedSeats(manager, session.id, [
        { mssv: student.mssv, name: student.name, homeClassId, homeTeacherId },
      ]);

      return saved;
    });
  }

  /**
   * Thêm vào ảnh chốt, KHÔNG ném nếu đã có — dùng cho đường duyệt
   * access-request.
   *
   * Vì sao cần: duyệt một yêu cầu vào thi ghi `enrollment`, và trước
   * thay đổi này chỉ ghi `enrollment`. Em được duyệt vào thi được, nộp
   * bài được, nhưng KHÔNG có trong ảnh chốt — nên bảng điểm (Task 7),
   * vốn đọc ảnh chốt để biết ai thuộc về nó, sẽ bỏ sót đúng em đó.
   *
   * Khác `addManually`: đường kia là thao tác có chủ đích của giảng
   * viên, nên trùng người là lỗi đáng báo. Ở đây trùng người chỉ là
   * duyệt lại một yêu cầu — im lặng bỏ qua mới đúng.
   *
   * Không có ca "duyệt trước khi đóng băng": muốn có yêu cầu vào thi
   * thì phải `agent:join` trước, mà join bị guard chặn khi ảnh chốt còn
   * rỗng. Thứ tự đó là thứ giữ cho hàm này không vô tình biến một ảnh
   * chốt rỗng thành "đã đóng băng".
   */
  async ensureManual(
    /** Chỉ cần id — người gọi (access-request gateway) cầm DTO, không cầm entity. */
    examSessionId: string,
    student: { mssv: string; name: string; homeClassId: string; homeTeacherId: string },
  ): Promise<void> {
    // Một transaction: cùng lý do như `freeze` — ảnh chốt và chỗ ngồi
    // phải cùng tồn tại hoặc cùng không.
    await this.dataSource.transaction(async (manager) => {
      await manager
        .getRepository(SessionRosterEntity)
        .createQueryBuilder()
        .insert()
        .values({
          examSessionId,
          studentMssv: student.mssv,
          studentName: student.name,
          homeClassId: student.homeClassId,
          homeTeacherId: student.homeTeacherId,
          source: 'manual',
        })
        .orIgnore()
        .execute();

      // Cũng gieo chỗ ngồi ở đây. Em được duyệt vào thi rồi chỉ nộp 1
      // trong 3 file bắt buộc thì hai file kia không có dòng nào — em
      // biến mất khỏi bảng điểm ở đúng hai ô đó.
      await this.seedSeats(manager, examSessionId, [
        {
          mssv: student.mssv,
          name: student.name,
          homeClassId: student.homeClassId,
          homeTeacherId: student.homeTeacherId,
        },
      ]);
    });
  }

  /**
   * Gieo một dòng `submission` cho mỗi (sinh viên × file bắt buộc).
   *
   * "Vắng" phải có CHỖ NGỒI trong bảng điểm, không phải là sự thiếu một
   * bản ghi. `not_submitted`, KHÔNG phải `absent` — đó là toàn bộ quyết
   * định D1: ở thời điểm này chưa ai quan sát gì cả, và một bảng điểm
   * xuất ngay sau đây phải đọc được là "chưa kết luận", không phải "cả
   * lớp vắng thi".
   *
   * `submitted_at` là NULL tường minh: chưa có file nào bay về. Cột có
   * `DEFAULT now()` nên bỏ trống sẽ cho một giờ bịa — đúng lúc giảng
   * viên bấm Mở phiên — mà mọi câu lọc theo cột ấy sẽ âm thầm đếm.
   *
   * `ON CONFLICT DO NOTHING` trên `uq_submission_identity` là thứ làm
   * hàm này dùng được ở CẢ BA đường vào: lúc đóng băng (chưa có gì),
   * lúc thêm tay giữa buổi (em có thể đã nộp một file rồi — dòng đó
   * phải được giữ nguyên, không bị kéo ngược về `not_submitted`), và
   * lúc duyệt lại một access-request (không có gì để làm).
   */
  private async seedSeats(
    manager: EntityManager,
    examSessionId: string,
    students: { mssv: string; name: string; homeClassId: string; homeTeacherId: string }[],
  ): Promise<number> {
    const deliverables = await manager.getRepository(RequiredDeliverableEntity).find({
      where: { examSessionId },
    });
    if (deliverables.length === 0 || students.length === 0) {
      return 0;
    }

    const rows = students.flatMap((student) =>
      deliverables.map((deliverable) => ({
        examSessionId,
        requiredDeliverableId: deliverable.id,
        studentMssv: student.mssv,
        studentNameInput: student.name,
        homeClassId: student.homeClassId,
        homeTeacherId: student.homeTeacherId,
        status: 'not_submitted' as const,
        submittedAt: null,
      })),
    );

    let inserted = 0;
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      const result = await manager
        .getRepository(SubmissionEntity)
        .createQueryBuilder()
        .insert()
        .values(rows.slice(i, i + INSERT_CHUNK))
        .orIgnore()
        .execute();
      inserted += result.identifiers.filter(Boolean).length;
    }
    return inserted;
  }

  private async insertChunked<T extends object>(
    repo: { insert(rows: T[]): Promise<unknown> },
    rows: T[],
  ): Promise<void> {
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await repo.insert(rows.slice(i, i + INSERT_CHUNK));
    }
  }

  /**
   * "Xác nhận kết thúc" đã có người ký → những dòng còn `not_submitted`
   * trở thành `absent`.
   *
   * Chạy TRONG transaction của `confirmEnd`, SAU khi `exam_session` đã
   * sang `completed`, và chỉ trên đường có `completed_by`. Lượt quét dự
   * phòng tuyệt đối không gọi hàm này — đó là toàn bộ hợp đồng §8.1.
   */
  async markAbsentees(manager: EntityManager, examSessionId: string): Promise<number> {
    const result = await manager
      .getRepository(SubmissionEntity)
      .createQueryBuilder()
      .update(SubmissionEntity)
      .set({ status: 'absent' })
      .where('exam_session_id = :examSessionId', { examSessionId })
      .andWhere('status = :notSubmitted', { notSubmitted: 'not_submitted' })
      .execute();
    return result.affected ?? 0;
  }
}
