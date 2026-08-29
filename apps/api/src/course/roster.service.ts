import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { ImportRosterDto, RosterStudentDto } from './dto/roster.dto';
import { RosterEntry, RosterImportResult } from './course.types';

/**
 * The class list — the Excel the training office issues, or a name typed in
 * one at a time.
 *
 * It writes `enrollment`, the table `agent:join` authenticates against,
 * which is why an import is a deliberate act with an explicit removal step
 * rather than a mirror of whatever file was dragged in last.
 *
 * Ownership is decided before anything here is called: the controller
 * resolves the class through `ClassService`, which is the single place
 * "is this class yours" is answered — for a lecturer that means
 * `class.teacher_id`, for a Trưởng khoa it means the course they own.
 */
@Injectable()
export class RosterService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listForClass(classId: string): Promise<RosterEntry[]> {
    const rows = await this.dataSource.getRepository(EnrollmentEntity).find({
      where: { homeClassId: classId },
      order: { studentMssv: 'ASC' },
    });
    return rows.map((row) => ({ mssv: row.studentMssv, name: row.studentName }));
  }

  /**
   * Applies a parsed file to one class, in one transaction.
   *
   * The whole file lands or none of it does — a partially applied roster is
   * the failure mode this phase exists to remove. The diff is recomputed
   * here from the database rather than trusted from the client: the browser
   * shows the user a preview, but what a preview said five minutes ago is
   * not authority over what is written now.
   */
  async importForClass(
    klass: ClassEntity,
    dto: ImportRosterDto,
  ): Promise<RosterImportResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);

      // Scoped to the COURSE, not to this class: the unique key is
      // (course_id, student_mssv), so a student sitting in a sibling class
      // is the row an insert here would collide with. Locked for the
      // transaction so two heads importing two classes of the same course
      // cannot both decide the same student is theirs.
      const existing = await repo.find({
        where: { courseId: klass.courseId },
        lock: { mode: 'pessimistic_write' },
      });
      const byMssv = new Map(
        existing.map((row) => [row.studentMssv.toLowerCase(), row]),
      );

      await this.assertNoCrossClassMove(manager, klass, dto.students, byMssv);

      let added = 0;
      let updated = 0;
      let unchanged = 0;

      for (const student of dto.students) {
        const current = byMssv.get(student.mssv.toLowerCase());

        if (!current) {
          await repo.insert({
            courseId: klass.courseId,
            studentMssv: student.mssv,
            studentName: student.name,
            homeClassId: klass.id,
            // Taken from the class, never from the file: the file has no
            // column for it, and inventing one would be the guessing this
            // project forbids.
            homeTeacherId: klass.teacherId,
          });
          added++;
          continue;
        }

        // The file carries a name; the class carries the lecturer. Either
        // drifting is a real change worth reporting, and neither should be
        // left stale on a row that a submission will be routed through.
        if (
          current.studentName !== student.name ||
          current.homeTeacherId !== klass.teacherId
        ) {
          await repo.update(current.id, {
            studentName: student.name,
            homeTeacherId: klass.teacherId,
          });
          updated++;
        } else {
          unchanged++;
        }
      }

      const inFile = new Set(dto.students.map((s) => s.mssv.toLowerCase()));
      const missing = existing.filter(
        (row) =>
          row.homeClassId === klass.id && !inFile.has(row.studentMssv.toLowerCase()),
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
        // Always reported, even when they were just deleted, so the caller
        // can name who left rather than only counting them.
        missing: missing.map((row) => ({
          mssv: row.studentMssv,
          name: row.studentName,
        })),
      };
    });
  }

  /**
   * Adds one student by hand.
   *
   * The bulk import is for the file the training office sends; this is for
   * the student who is genuinely on the class list and simply not in it —
   * a late transfer, a correction. Same rules as a row of the file: the
   * MSSV is validated identically, and a student already sitting in a
   * sibling class of the same course is refused rather than moved.
   *
   * Not audited, and that is deliberate. The access-request path writes an
   * `audit_log` entry because a machine-enforced refusal is being opened by
   * a human at exam time; editing your own class list beforehand is
   * ordinary preparation, and auditing it would bury the entries that
   * matter under the ones that do not.
   */
  async addStudent(klass: ClassEntity, student: RosterStudentDto): Promise<RosterEntry> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);
      const existing = await repo.find({
        where: { courseId: klass.courseId },
        lock: { mode: 'pessimistic_write' },
      });
      const byMssv = new Map(
        existing.map((row) => [row.studentMssv.toLowerCase(), row]),
      );

      await this.assertNoCrossClassMove(manager, klass, [student], byMssv);

      const current = byMssv.get(student.mssv.toLowerCase());
      if (current) {
        // Already in THIS class. Updating the name rather than refusing:
        // the caller's intent is "this student should be on the list", and
        // they already are.
        await repo.update(current.id, {
          studentName: student.name,
          homeTeacherId: klass.teacherId,
        });
      } else {
        await repo.insert({
          courseId: klass.courseId,
          studentMssv: student.mssv,
          studentName: student.name,
          homeClassId: klass.id,
          homeTeacherId: klass.teacherId,
        });
      }

      return { mssv: student.mssv, name: student.name };
    });
  }

  /**
   * Removes one student from this class's list.
   *
   * The counterpart to adding by hand: a lecturer who typed the wrong MSSV
   * needs an undo that is not "re-import the whole file with a tick".
   * Scoped to the class, so a valid MSSV from a sibling class reads as
   * not-found rather than deleting someone else's student.
   */
  async removeStudent(klass: ClassEntity, studentMssv: string): Promise<void> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    const enrollment = await repo.findOne({
      where: { courseId: klass.courseId, studentMssv, homeClassId: klass.id },
    });
    if (!enrollment) {
      throw new NotFoundException('Sinh viên này không có trong danh sách lớp.');
    }
    await repo.remove(enrollment);
  }

  /**
   * A student in the file who is already enrolled in this course through a
   * DIFFERENT class stops the import.
   *
   * Silently moving them would change where their submission is routed —
   * home_class_id and home_teacher_id are copied onto every submission they
   * make — and it would happen as a side effect of a file someone dragged
   * in. A transfer between classes is a decision; the path is to remove them
   * from the old class's roster first, which takes the explicit tick.
   */
  private async assertNoCrossClassMove(
    manager: EntityManager,
    klass: ClassEntity,
    students: RosterStudentDto[],
    byMssv: Map<string, EnrollmentEntity>,
  ): Promise<void> {
    const clashes = students
      .map((student) => byMssv.get(student.mssv.toLowerCase()))
      .filter(
        (row): row is EnrollmentEntity =>
          row !== undefined && row.homeClassId !== klass.id,
      );

    if (clashes.length === 0) {
      return;
    }

    const names = new Map(
      (
        await manager.getRepository(ClassEntity).find({
          where: { id: In(Array.from(new Set(clashes.map((row) => row.homeClassId)))) },
        })
      ).map((row) => [row.id, row.name]),
    );

    const detail = clashes
      .map((row) => `${row.studentMssv} (đang ở lớp "${names.get(row.homeClassId) ?? '?'}")`)
      .join(', ');

    throw new ConflictException(
      `Những sinh viên sau đã thuộc một lớp khác của cùng môn học: ${detail}. ` +
        'Hãy xoá họ khỏi danh sách lớp cũ trước, rồi import lại — chuyển lớp ' +
        'sẽ đổi nơi bài làm của họ được gửi về.',
    );
  }
}
