import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { StudentEntity } from '../master-data/entities/student.entity';
import { ImportRosterDto, RosterStudentDto } from './dto/roster.dto';
import { RosterEntry, RosterImportResult } from './course.types';

export type AddRosterStudentInput = {
  studentId?: string;
  mssv?: string;
  name?: string;
};

/**
 * Danh sách SV của lớp học phần — ghi `enrollment`.
 *
 * Ownership do caller quyết (teacher `findTaughtBy` hoặc admin load lớp).
 * `home_teacher_id` copy từ `class.teacher_id` (có thể null trước khi gán GV).
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

  async importForClass(
    klass: ClassEntity,
    dto: ImportRosterDto,
  ): Promise<RosterImportResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);

      const existing = await this.siblingEnrollments(manager, klass);
      const byMssv = new Map(
        existing.map((row) => [row.studentMssv.toLowerCase(), row]),
      );

      await this.assertNoCrossClassMove(manager, klass, dto.students, byMssv);

      let added = 0;
      let updated = 0;
      let unchanged = 0;

      for (const student of dto.students) {
        const studentId = await this.resolveStudentId(manager, student.mssv);
        const current = byMssv.get(student.mssv.toLowerCase());

        if (!current) {
          await repo.insert({
            studentMssv: student.mssv,
            studentName: student.name,
            homeClassId: klass.id,
            homeTeacherId: klass.teacherId ?? null,
            studentId,
          });
          added++;
          continue;
        }

        if (
          current.studentName !== student.name ||
          current.homeTeacherId !== klass.teacherId ||
          (studentId && current.studentId !== studentId)
        ) {
          await repo.update(current.id, {
            studentName: student.name,
            homeTeacherId: klass.teacherId ?? null,
            ...(studentId ? { studentId } : {}),
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
        missing: missing.map((row) => ({
          mssv: row.studentMssv,
          name: row.studentName,
        })),
      };
    });
  }

  /**
   * Thêm một SV: `{ studentId }` từ catalog, hoặc `{ mssv, name }` gõ tay.
   */
  async addStudent(
    klass: ClassEntity,
    input: AddRosterStudentInput,
  ): Promise<RosterEntry> {
    return this.dataSource.transaction(async (manager) => {
      const resolved = await this.resolveAddInput(manager, input);
      const repo = manager.getRepository(EnrollmentEntity);
      const existing = await this.siblingEnrollments(manager, klass);
      const byMssv = new Map(
        existing.map((row) => [row.studentMssv.toLowerCase(), row]),
      );

      await this.assertNoCrossClassMove(manager, klass, [resolved], byMssv);

      const current = byMssv.get(resolved.mssv.toLowerCase());
      if (current) {
        await repo.update(current.id, {
          studentName: resolved.name,
          homeTeacherId: klass.teacherId ?? null,
          studentId: resolved.studentId ?? current.studentId,
        });
      } else {
        await repo.insert({
          studentMssv: resolved.mssv,
          studentName: resolved.name,
          homeClassId: klass.id,
          homeTeacherId: klass.teacherId ?? null,
          studentId: resolved.studentId ?? null,
        });
      }

      return { mssv: resolved.mssv, name: resolved.name };
    });
  }

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
   * Sửa họ tên trên roster lớp — giữ MSSV. Resolve lại `student_id`
   * theo mssv nếu catalog có hàng khớp (không cascade từ catalog name).
   */
  async updateStudentName(
    klass: ClassEntity,
    studentMssv: string,
    name: string,
  ): Promise<RosterEntry> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);
      const enrollment = await repo.findOne({
        where: { studentMssv, homeClassId: klass.id },
      });
      if (!enrollment) {
        throw new NotFoundException('Sinh viên này không có trong danh sách lớp.');
      }

      const studentId = await this.resolveStudentId(manager, enrollment.studentMssv);
      enrollment.studentName = name;
      if (studentId) {
        enrollment.studentId = studentId;
      }
      await repo.save(enrollment);
      return { mssv: enrollment.studentMssv, name: enrollment.studentName };
    });
  }

  private async resolveAddInput(
    manager: EntityManager,
    input: AddRosterStudentInput,
  ): Promise<RosterStudentDto & { studentId: string | null }> {
    if (input.studentId) {
      const student = await manager.getRepository(StudentEntity).findOne({
        where: { id: input.studentId },
      });
      if (!student) {
        throw new NotFoundException('Không tìm thấy sinh viên trong catalog.');
      }
      if (student.status !== 'active') {
        throw new BadRequestException('Sinh viên catalog không ở trạng thái active.');
      }
      return {
        mssv: student.mssv,
        name: student.fullName,
        studentId: student.id,
      };
    }

    if (!input.mssv || !input.name) {
      throw new BadRequestException('Cần studentId hoặc cặp mssv + name.');
    }

    const studentId = await this.resolveStudentId(manager, input.mssv);
    return { mssv: input.mssv, name: input.name, studentId };
  }

  private async resolveStudentId(
    manager: EntityManager,
    mssv: string,
  ): Promise<string | null> {
    const row = await manager.getRepository(StudentEntity).findOne({
      where: { mssv },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /**
   * Enrollment các lớp cùng môn: ưu tiên `course_id`, fallback `course_name`
   * (lớp legacy).
   */
  private async siblingEnrollments(
    manager: EntityManager,
    klass: ClassEntity,
  ): Promise<EnrollmentEntity[]> {
    const classRepo = manager.getRepository(ClassEntity);
    const siblings = klass.courseId
      ? await classRepo.find({
          where: { courseId: klass.courseId },
          select: { id: true },
        })
      : await classRepo.find({
          where: { courseName: klass.courseName },
          select: { id: true },
        });

    if (siblings.length === 0) {
      return [];
    }

    return manager.getRepository(EnrollmentEntity).find({
      where: { homeClassId: In(siblings.map((row) => row.id)) },
      lock: { mode: 'pessimistic_write' },
    });
  }

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
