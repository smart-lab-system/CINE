import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { ImportRosterDto, RosterStudentDto } from './dto/roster.dto';
import { RosterEntry, RosterImportResult } from './course.types';
import { ClassLabelService } from './class-label.service';
import { StudentService } from './student.service';

/**
 * The class list — the Excel the training office issues, or a name typed in
 * one at a time.
 *
 * It writes `enrollment`, the table `agent:join` authenticates against, which is
 * why an import is a deliberate act with an explicit removal step rather than a
 * mirror of whatever file was dragged in last. Names go to `student`, not to
 * `enrollment` (spec §2.6): one name per student, however many classes they sit in.
 *
 * Ownership is decided before anything here is called: the controller resolves the
 * class through `ClassService`, which is the single place "is this class yours" is
 * answered (`class.teacher_id`).
 */
@Injectable()
export class RosterService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly students: StudentService,
    private readonly labels: ClassLabelService,
  ) {}

  /**
   * `COALESCE(student, enrollment)`: tên trong `student` thắng; cột cũ chỉ cứu dòng chưa
   * backfill, để một dòng như vậy không biến mất khỏi danh sách. Cột cũ bị gỡ ở plan H.
   */
  async listForClass(classId: string): Promise<RosterEntry[]> {
    return this.dataSource.query(
      `SELECT e.student_mssv::text AS mssv,
              COALESCE(s.full_name, e.student_name, '') AS name
         FROM examcollect.enrollment e
         LEFT JOIN examcollect.student s ON s.mssv = e.student_mssv
        WHERE e.home_class_id = $1
        ORDER BY e.student_mssv`,
      [classId],
    );
  }

  /**
   * Applies a parsed file to one class, in one transaction.
   *
   * The whole file lands or none of it does — a partially applied roster is the failure
   * mode this phase exists to remove. The diff is recomputed here from the database
   * rather than trusted from the client: the browser shows the user a preview, but what
   * a preview said five minutes ago is not authority over what is written now.
   */
  async importForClass(klass: ClassEntity, dto: ImportRosterDto): Promise<RosterImportResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);

      // Phạm vi là HỌC KỲ của lớp (spec §2.3 mục 3): "em đã ở một lớp khác CÙNG KỲ" là ca đáng
      // chặn. Khoá ghi trong suốt giao dịch để hai lượt import song song không cùng nhận một sinh viên.
      const existing = await this.siblingEnrollments(manager, klass);
      const byMssv = new Map(existing.map((row) => [row.studentMssv.toLowerCase(), row]));

      await this.assertNoCrossClassMove(klass, dto.students, byMssv);

      // Tên: FILE THẮNG. Làm trước enrollment để một lỗi ở đây không để lại nửa danh sách.
      const { renamed } = await this.students.upsertFromRoster(manager, dto.students);
      const renamedKeys = new Set(renamed.map((row) => row.mssv.toLowerCase()));

      let added = 0;
      let updated = 0;
      let unchanged = 0;

      for (const student of dto.students) {
        const key = student.mssv.toLowerCase();
        const current = byMssv.get(key);

        if (!current) {
          await repo.insert({
            studentMssv: student.mssv,
            homeClassId: klass.id,
            // Taken from the class, never from the file: the file has no column for it, and
            // inventing one would be the guessing this project forbids.
            homeTeacherId: klass.teacherId,
          });
          added++;
          continue;
        }

        // The class carries the lecturer; the file carries the name. Either drifting is a real
        // change worth reporting, and neither should be left stale on a row a submission is
        // routed through.
        if (current.homeTeacherId !== klass.teacherId) {
          await repo.update(current.id, { homeTeacherId: klass.teacherId });
          updated++;
        } else if (renamedKeys.has(key)) {
          updated++;
        } else {
          unchanged++;
        }
      }

      const inFile = new Set(dto.students.map((s) => s.mssv.toLowerCase()));
      const missing = existing.filter(
        (row) => row.homeClassId === klass.id && !inFile.has(row.studentMssv.toLowerCase()),
      );
      const missingNames = await this.students.findNames(
        manager,
        missing.map((row) => row.studentMssv),
      );

      let removed = 0;
      if (dto.removeMissing && missing.length > 0) {
        await repo.delete(missing.map((row) => row.id));
        removed = missing.length;
      }

      return {
        added,
        updated,
        unchanged,
        removed,
        // Always reported, even when they were just deleted, so the caller can name who left
        // rather than only counting them. Chỉ enrollment bị xoá — `student` không bao giờ.
        missing: missing.map((row) => ({
          mssv: row.studentMssv,
          name: missingNames.get(row.studentMssv.toLowerCase()) ?? row.studentName ?? '',
        })),
        renamed,
      };
    });
  }

  /**
   * Adds one student by hand.
   *
   * The bulk import is for the file the training office sends; this is for the student who is
   * genuinely on the class list and simply not in it — a late transfer, a correction. Same rules
   * as a row of the file: the MSSV is validated identically, and a student already sitting in a
   * sibling class of the same semester is refused rather than moved.
   *
   * TÊN: MSSV đã có thì tên được GIỮ — người gõ không sửa được tên qua ô này (spec §2.6), và
   * phản hồi trả tên đang lưu để giao diện hiện đúng thứ đã ghi. MSSV chưa có thì tạo `student`
   * bằng tên gõ.
   *
   * Not audited, and that is deliberate. The access-request path writes an `audit_log` entry
   * because a machine-enforced refusal is being opened by a human at exam time; editing your own
   * class list beforehand is ordinary preparation, and auditing it would bury the entries that
   * matter under the ones that do not.
   */
  async addStudent(klass: ClassEntity, student: RosterStudentDto): Promise<RosterEntry> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);
      const existing = await this.siblingEnrollments(manager, klass);
      const byMssv = new Map(existing.map((row) => [row.studentMssv.toLowerCase(), row]));

      await this.assertNoCrossClassMove(klass, [student], byMssv);

      const name = await this.students.ensureKeepingStoredName(manager, student.mssv, student.name);

      const current = byMssv.get(student.mssv.toLowerCase());
      if (current) {
        // Already in THIS class. The caller's intent is "this student should be on the list", and
        // they already are — only the routing teacher can need fixing.
        if (current.homeTeacherId !== klass.teacherId) {
          await repo.update(current.id, { homeTeacherId: klass.teacherId });
        }
      } else {
        await repo.insert({
          studentMssv: student.mssv,
          homeClassId: klass.id,
          homeTeacherId: klass.teacherId,
        });
      }

      return { mssv: student.mssv, name };
    });
  }

  /**
   * Removes one student from this class's list.
   *
   * The counterpart to adding by hand: a lecturer who typed the wrong MSSV needs an undo that is
   * not "re-import the whole file with a tick". Scoped to the class, so a valid MSSV from a sibling
   * class reads as not-found rather than deleting someone else's student.
   */
  async removeStudent(klass: ClassEntity, studentMssv: string): Promise<void> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    const enrollment = await repo.findOne({
      where: { studentMssv, homeClassId: klass.id },
    });
    if (!enrollment) {
      throw new NotFoundException('Sinh viên này không có trong danh sách lớp.');
    }
    await repo.remove(enrollment);
  }

  /**
   * Mọi enrollment của các lớp CÙNG HỌC KỲ với lớp này, khoá ghi trong giao dịch.
   *
   * Từng là các lớp "cùng môn" (`class.course_name` bằng nhau). Môn là hằng số nên tập đó là MỌI lớp
   * mọi kỳ — một sinh viên học lại ở kỳ sau bị chặn oan. Phạm vi đúng là học kỳ (spec §2.3 mục 3).
   *
   * Lớp chưa có học kỳ (dữ liệu cũ chưa backfill) chỉ so với chính nó: không có căn cứ nào để gọi lớp
   * khác là "cùng kỳ", và chặn nhầm tệ hơn bỏ sót ở một trạng thái chuyển tiếp ngắn.
   */
  private async siblingEnrollments(
    manager: EntityManager,
    klass: ClassEntity,
  ): Promise<EnrollmentEntity[]> {
    const classIds: string[] = klass.semesterId
      ? (
          await manager.query(`SELECT id FROM examcollect.class WHERE semester_id = $1`, [klass.semesterId])
        ).map((row: { id: string }) => row.id)
      : [klass.id];
    return manager.getRepository(EnrollmentEntity).find({
      where: { homeClassId: In(classIds) },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * A student in the file who is already enrolled in the same semester through a DIFFERENT class
   * stops the import.
   *
   * Silently moving them would change where their submission is routed — home_class_id and
   * home_teacher_id are copied onto every submission they make — and it would happen as a side effect
   * of a file someone dragged in. A transfer between classes is a decision; the path is to remove them
   * from the old class's roster first, which takes the explicit tick.
   */
  private async assertNoCrossClassMove(
    klass: ClassEntity,
    students: RosterStudentDto[],
    byMssv: Map<string, EnrollmentEntity>,
  ): Promise<void> {
    const clashes = students
      .map((student) => byMssv.get(student.mssv.toLowerCase()))
      .filter(
        (row): row is EnrollmentEntity => row !== undefined && row.homeClassId !== klass.id,
      );

    if (clashes.length === 0) {
      return;
    }

    const names = await this.labels.labelsFor(Array.from(new Set(clashes.map((row) => row.homeClassId))));

    const detail = clashes
      .map((row) => `${row.studentMssv} (đang ở lớp "${names.get(row.homeClassId) ?? '?'}")`)
      .join(', ');

    throw new ConflictException(
      `Những sinh viên sau đã thuộc một lớp khác của cùng học kỳ: ${detail}. ` +
        'Hãy xoá họ khỏi danh sách lớp cũ trước, rồi import lại — chuyển lớp ' +
        'sẽ đổi nơi bài làm của họ được gửi về.',
    );
  }
}
