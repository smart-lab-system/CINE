import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionGateway } from './exam-session.gateway';
import { RecollectResult } from './recollect.types';

interface MissingStudent {
  mssv: string;
  name: string;
}

/**
 * "Thu lại" — spec
 * docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md §6.
 *
 * Thao tác ĐỌC-RỒI-GỬI: không đổi trạng thái gì ở server, nên bấm bao
 * nhiêu lần cũng được, và em nộp giữa hai lần bấm tự rơi khỏi tập đích.
 */
@Injectable()
export class RecollectService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly examSessions: ExamSessionService,
    private readonly gateway: ExamSessionGateway,
  ) {}

  /**
   * Ai đã dự thi mà chưa nộp đủ file bắt buộc.
   *
   * "Đã dự thi" đọc từ `agent_connection_event` chứ không từ roster: mục
   * tiêu là những máy CÓ THỂ nộp lại, và một em chưa từng kết nối thì
   * không có gì để thu — báo em đó "unreachable" chỉ làm loãng danh sách
   * giảng viên phải đi kiểm.
   *
   * "Chưa đủ" so số file `collected` với số `required_deliverable`, nên
   * nó gồm cả em nộp thiếu một file, không chỉ em trắng tay. Đó mới là
   * ca thu lại có ích nhất.
   *
   * MSSV trả về lấy từ ROSTER (`e.student_mssv`) chứ không từ bảng sự
   * kiện, để nó và cái tên đi kèm luôn cùng một dòng — hai cột đều là
   * `citext` nên phép nối vẫn khớp bất kể ai gõ hoa hay thường, chỉ khác
   * cách viết được trả về.
   */
  private findMissing(examSessionId: string): Promise<MissingStudent[]> {
    return this.dataSource.query(
      `WITH required AS (
         SELECT COUNT(*)::int AS n
           FROM examcollect.required_deliverable
          WHERE exam_session_id = $1
       ),
       attended AS (
         SELECT DISTINCT student_mssv
           FROM examcollect.agent_connection_event
          WHERE exam_session_id = $1
       ),
       collected AS (
         SELECT student_mssv, COUNT(*)::int AS n
           FROM examcollect.submission
          WHERE exam_session_id = $1 AND status = 'collected'
          GROUP BY student_mssv
       )
       SELECT e.student_mssv AS mssv, e.student_name AS name
         FROM attended a
         JOIN examcollect.exam_session s ON s.id = $1
         JOIN examcollect.enrollment e
           ON e.course_id = s.course_id AND e.student_mssv = a.student_mssv
         LEFT JOIN collected c ON c.student_mssv = a.student_mssv
        WHERE COALESCE(c.n, 0) < (SELECT n FROM required)
        ORDER BY e.student_name`,
      [examSessionId],
    ) as Promise<MissingStudent[]>;
  }

  async requestRecollect(id: string, teacherId: string): Promise<RecollectResult> {
    const session = await this.examSessions.findEntityForOwner(id, teacherId);
    if (session.status !== 'collecting') {
      // Chỉ `collecting` mới đúng nghĩa: trước đó chưa ai đến hạn phải
      // nộp, sau đó thì agent có thể đã tắt và bài về muộn hơn
      // `endTime + grace` sẽ bị `isAcceptingUploads` từ chối — gửi lệnh
      // ở hai phía đó chỉ tạo kỳ vọng sai cho người bấm.
      throw new ConflictException(
        'Chỉ thu lại được khi phiên đang ở trạng thái Đang thu bài',
      );
    }

    const missing = await this.findMissing(id);
    const ackedMssv = await this.gateway.requestRecollect(
      id,
      missing.map((student) => student.mssv),
    );
    const acked = new Set(ackedMssv.map((mssv) => mssv.toLowerCase()));
    const unreachable = missing.filter((student) => !acked.has(student.mssv.toLowerCase()));

    return {
      missing: missing.length,
      // Suy ra từ `unreachable` chứ không đếm `ackedMssv`: một agent đã
      // nộp xong nhưng còn nằm trong phòng vẫn có thể ack, và đếm thẳng
      // sẽ báo nhiều hơn số em thật sự thiếu bài.
      acknowledged: missing.length - unreachable.length,
      unreachable: unreachable.length,
      unreachableNames: unreachable.map((student) => student.name),
    };
  }
}
