import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { COURSE_NAME } from '../common/course-name';
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
  normalizeGroupName,
} from '../common/master-data-normalize';
import { ClassEntity } from './entities/class.entity';
import {
  CreateClassDto,
  SearchClassesDto,
  SearchTeachingClassesDto,
  UpdateClassDto,
} from './dto/class.dto';
import { ClassAdminView, TeachingClassView } from './course.types';

/** Bọc ô tìm thành pattern ILIKE và trung hoà `%`, `_`, `\` bên trong. */
function toLikePattern(q: string): string {
  const escaped = q.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

interface AdminRow {
  id: string;
  label: string;
  labelWithSemester: string;
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  administrativeClassId: string | null;
  administrativeClassCode: string | null;
  groupName: string;
  teacherId: string;
  teacherName: string;
  studentCount: number;
  sessionCount: number;
}

/**
 * Lớp, và quyền sở hữu của giảng viên trên chúng (spec §2.3, §4).
 *
 * ADMIN tạo, sửa, xoá và giao giảng viên; giảng viên chỉ ĐỌC lớp được giao. Đảo lại thay đổi 21/09
 * (giảng viên tự tạo lớp): dữ liệu nền do admin khai và kiểm chứng được bằng khoá ngoại, giảng viên chỉ
 * chọn trong đó. Admin thành điểm nghẽn — lựa chọn có ý thức (spec §12 mục 1).
 *
 * `class.teacher_id` vẫn là TOÀN BỘ phạm vi của một giảng viên, và mọi kiểm tra "lớp này có phải của bạn" là
 * một phép so ở đúng một chỗ: `findOwnedByTeacher`.
 *
 * Bất biến "không đổi học kỳ của lớp đã có phiên" nằm ở DB (trigger, plan C); kiểm ở đây chỉ để câu báo lỗi
 * nói rõ có bao nhiêu phiên thay cho "This request conflicts with an existing record".
 */
@Injectable()
export class ClassService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  // ------------------------------------------------------------------ giảng viên đọc

  /**
   * Lớp giảng viên này dạy, cho "Lớp của tôi" và form tạo phiên: MỘT truy vấn có GROUP BY (không đếm
   * từng dòng), vì danh sách này được tải ở mỗi lần vào form. Bộ lọc học kỳ chỉ hẹp tầm nhìn.
   */
  async findForTeacher(
    teacherId: string,
    filters: SearchTeachingClassesDto,
  ): Promise<TeachingClassView[]> {
    const rows: Array<{
      id: string;
      label: string;
      labelWithSemester: string;
      courseName: string;
      semesterId: string | null;
      academicYear: number | null;
      term: number | null;
      studentCount: string;
    }> = await this.dataSource.query(
      `SELECT c.id,
              cl.label,
              cl.label_with_semester AS "labelWithSemester",
              c.course_name AS "courseName",
              sem.id AS "semesterId",
              sem.academic_year_start AS "academicYear",
              sem.term,
              COUNT(e.id) AS "studentCount"
         FROM examcollect.class c
         JOIN examcollect.class_label cl ON cl.class_id = c.id
         LEFT JOIN examcollect.semester sem ON sem.id = c.semester_id
         LEFT JOIN examcollect.enrollment e ON e.home_class_id = c.id
        WHERE c.teacher_id = $1
          AND ($2::uuid IS NULL OR c.semester_id = $2)
          AND ($3::int  IS NULL OR sem.academic_year_start = $3)
        GROUP BY c.id, cl.label, cl.label_with_semester, sem.id, sem.academic_year_start, sem.term
        ORDER BY sem.academic_year_start DESC NULLS LAST, sem.term DESC NULLS LAST, cl.label`,
      [teacherId, filters.semesterId ?? null, filters.academicYear ?? null],
    );
    return rows.map((row) => ({ ...row, studentCount: parseInt(row.studentCount, 10) }));
  }

  /**
   * The class, if this lecturer is the one who teaches it — 404 when it does not exist, 403 when it is a
   * colleague's. A 403 on a class that does not exist would confirm that some other lecturer's class has
   * that id.
   */
  async findTaughtBy(id: string, teacherId: string): Promise<ClassEntity> {
    return this.findOwnedByTeacher(id, teacherId);
  }

  /**
   * Một lớp, giới hạn trong cùng MÔN với phiên thi. Thay `CourseService.findClassForCourse`; giữ lại vì duyệt
   * một yêu cầu xin phép không được gắn sinh viên vào lớp của một môn khác. Hiện luôn đúng (môn là hằng số).
   */
  async findByIdAndCourseName(id: string, courseName: string): Promise<ClassEntity | null> {
    return this.classes.findOne({ where: { id, courseName } });
  }

  /** Vị từ quyền dùng chung: 404 khi không tồn tại, 403 khi tồn tại nhưng của người khác. */
  async findOwnedByTeacher(id: string, teacherId: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
    if (klass.teacherId !== teacherId) {
      throw new ForbiddenException('You do not teach this class');
    }
    return klass;
  }

  // ------------------------------------------------------------------- admin đọc

  async listForAdmin(filters: SearchClassesDto): Promise<ClassAdminView[]> {
    return this.queryAdminRows(
      `WHERE ($1::uuid IS NULL OR c.semester_id = $1)
         AND ($2::int  IS NULL OR sem.academic_year_start = $2)
         AND ($3::uuid IS NULL OR c.teacher_id = $3)
         AND ($4::text IS NULL OR ac.code::text ILIKE $4 ESCAPE '\\')`,
      [
        filters.semesterId ?? null,
        filters.academicYear ?? null,
        filters.teacherId ?? null,
        filters.q ? toLikePattern(filters.q) : null,
      ],
    );
  }

  // ------------------------------------------------------------------ admin ghi

  async create(actorId: string, dto: CreateClassDto): Promise<ClassAdminView> {
    const groupName = normalizeGroupName(dto.groupName);
    return this.dataSource.transaction(async (manager) => {
      await this.assertSemesterExists(manager, dto.semesterId);
      const administrativeClassId = await this.resolveAdministrativeClass(manager, dto);
      const teacher = await this.assertActiveTeacher(manager, dto.teacherId);
      await this.assertGroupFree(manager, dto.semesterId, administrativeClassId, groupName, null);

      const repo = manager.getRepository(ClassEntity);
      const saved = await repo.save(
        repo.create({
          courseName: COURSE_NAME,
          semesterId: dto.semesterId,
          administrativeClassId,
          groupName,
          teacherId: dto.teacherId,
        }),
      );

      const view = await this.readAdminRow(manager, saved.id);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'class.create',
          targetType: 'class',
          targetId: saved.id,
          newValue: {
            targetLabel: view.labelWithSemester,
            semester: view.labelWithSemester.split(' · ')[1] ?? null,
            administrativeClass: view.administrativeClassCode,
            groupName,
            teacherName: teacher.name,
          },
        },
        manager,
      );
      return view;
    });
  }

  async update(actorId: string, id: string, dto: UpdateClassDto): Promise<ClassAdminView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy lớp.');

      const before = await this.readAdminRow(manager, id);

      const nextSemesterId = dto.semesterId ?? current.semesterId;
      const nextAdministrativeClassId =
        dto.administrativeClassId !== undefined || dto.administrativeClassCode !== undefined
          ? await this.resolveAdministrativeClass(manager, dto)
          : current.administrativeClassId;
      const nextGroup = dto.groupName === undefined ? current.groupName : normalizeGroupName(dto.groupName);
      const nextTeacherId = dto.teacherId ?? current.teacherId;

      const semesterChanged = nextSemesterId !== current.semesterId;
      const administrativeChanged = nextAdministrativeClassId !== current.administrativeClassId;
      const groupChanged = nextGroup !== current.groupName;
      const teacherChanged = nextTeacherId !== current.teacherId;
      if (!semesterChanged && !administrativeChanged && !groupChanged && !teacherChanged) {
        return before;
      }

      if (semesterChanged) {
        if (nextSemesterId) await this.assertSemesterExists(manager, nextSemesterId);
        if (before.sessionCount > 0) {
          throw new ConflictException(
            `Không đổi được học kỳ của lớp ${before.label} vì lớp đã có ${before.sessionCount} phiên thi. ` +
              'Phiên thi đã ghi nhãn học kỳ cũ; muốn đổi thì tạo lớp mới ở kỳ mới.',
          );
        }
      }
      let teacherName: string | null = null;
      if (teacherChanged) teacherName = (await this.assertActiveTeacher(manager, nextTeacherId)).name;
      if (semesterChanged || administrativeChanged || groupChanged) {
        await this.assertGroupFree(manager, nextSemesterId, nextAdministrativeClassId, nextGroup, id);
      }

      current.semesterId = nextSemesterId;
      current.administrativeClassId = nextAdministrativeClassId;
      current.groupName = nextGroup;
      await repo.save(current);

      if (teacherChanged) {
        await this.applyTeacherChange(manager, id, nextTeacherId);
      }

      const after = await this.readAdminRow(manager, id);

      if (semesterChanged || administrativeChanged || groupChanged) {
        const oldValue: Record<string, unknown> = {};
        const newValue: Record<string, unknown> = {};
        if (semesterChanged) {
          oldValue.semester = before.labelWithSemester.split(' · ')[1] ?? null;
          newValue.semester = after.labelWithSemester.split(' · ')[1] ?? null;
        }
        if (administrativeChanged) {
          oldValue.administrativeClass = before.administrativeClassCode;
          newValue.administrativeClass = after.administrativeClassCode;
        }
        if (groupChanged) {
          oldValue.groupName = before.groupName;
          newValue.groupName = after.groupName;
        }
        newValue.targetLabel = after.labelWithSemester;
        await this.audit.recordUserAction(
          { actorId, action: 'class.update', targetType: 'class', targetId: id, oldValue, newValue },
          manager,
        );
      }
      if (teacherChanged) {
        await this.audit.recordUserAction(
          {
            actorId,
            action: 'class.reassign_teacher',
            targetType: 'class',
            targetId: id,
            oldValue: { teacherName: before.teacherName },
            newValue: { targetLabel: after.labelWithSemester, teacherName },
          },
          manager,
        );
      }
      return after;
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy lớp.');

      const view = await this.readAdminRow(manager, id);
      const blockers: string[] = [];
      if (view.studentCount > 0) blockers.push(`${view.studentCount} sinh viên`);
      if (view.sessionCount > 0) blockers.push(`${view.sessionCount} phiên thi`);
      if (blockers.length > 0) {
        throw new ConflictException(
          `Lớp ${view.label} còn ${blockers.join(' và ')} nên không xoá được. ` +
            'Hãy xoá danh sách sinh viên (và chuyển hoặc bỏ các phiên thi) trước.',
        );
      }

      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'class.delete',
          targetType: 'class',
          targetId: id,
          oldValue: {
            targetLabel: view.labelWithSemester,
            semester: view.labelWithSemester.split(' · ')[1] ?? null,
            administrativeClass: view.administrativeClassCode,
            groupName: view.groupName,
            teacherName: view.teacherName,
          },
        },
        manager,
      );
    });
  }

  /**
   * Đổi giảng viên của MỘT lớp, trong transaction của người gọi (spec §2.3 mục 2): lớp và `enrollment.home_teacher_id` đổi
   * theo; `exam_session.teacher_id`, `session_roster.home_teacher_id` và `submission.home_teacher_id` đã có GIỮ giảng viên
   * cũ để không ai sửa được điểm của phiên người khác đã chấm. Dùng chung cho `update` (nhập tay) và import (spec §6.2
   * nguyên tắc 6) — hai đường không được lệch nhau ở chính điểm này.
   */
  async applyTeacherChange(manager: EntityManager, classId: string, teacherId: string): Promise<void> {
    await manager.getRepository(ClassEntity).update({ id: classId }, { teacherId });
    await manager.query(`UPDATE examcollect.enrollment SET home_teacher_id = $1 WHERE home_class_id = $2`, [
      teacherId,
      classId,
    ]);
  }

  // ------------------------------------------------------------------- nội bộ

  private async assertSemesterExists(manager: EntityManager, semesterId: string): Promise<void> {
    const [row] = await manager.query(`SELECT 1 AS found FROM examcollect.semester WHERE id = $1`, [semesterId]);
    if (!row) throw new BadRequestException('Không tìm thấy học kỳ đã chọn. Hãy tạo học kỳ trước.');
  }

  /**
   * Chỉ CHỌN, không tạo. Nhận id hoặc mã (đúng một trong hai); mã chưa có trong Danh mục là 400 nói rõ
   * "hãy thêm vào Danh mục lớp danh nghĩa trước" — và KHÔNG tạo mã (spec §2.2).
   */
  private async resolveAdministrativeClass(
    manager: EntityManager,
    dto: { administrativeClassId?: string; administrativeClassCode?: string },
  ): Promise<string> {
    const hasId = dto.administrativeClassId !== undefined;
    const hasCode = dto.administrativeClassCode !== undefined;
    if (hasId === hasCode) {
      throw new BadRequestException(
        'Hãy chọn lớp danh nghĩa bằng đúng một trong hai: administrativeClassId hoặc administrativeClassCode.',
      );
    }
    if (hasId) {
      const [row] = await manager.query(
        `SELECT id FROM examcollect.administrative_class WHERE id = $1`,
        [dto.administrativeClassId],
      );
      if (!row) {
        throw new BadRequestException('Không tìm thấy lớp danh nghĩa đã chọn trong Danh mục lớp danh nghĩa.');
      }
      return row.id as string;
    }
    const code = normalizeAdministrativeCode(dto.administrativeClassCode!);
    const problem = administrativeCodeProblem(code);
    if (problem) throw new BadRequestException(problem);
    const [row] = await manager.query(
      `SELECT id FROM examcollect.administrative_class WHERE code = $1`,
      [code],
    );
    if (!row) {
      throw new BadRequestException(
        `Mã ${code} chưa có trong Danh mục lớp danh nghĩa, hãy thêm nó vào Danh mục trước.`,
      );
    }
    return row.id as string;
  }

  private async assertActiveTeacher(manager: EntityManager, teacherId: string): Promise<{ name: string }> {
    const [row] = await manager.query(
      `SELECT name, role, is_active FROM examcollect.account WHERE id = $1`,
      [teacherId],
    );
    if (!row || row.role !== 'teacher') {
      throw new BadRequestException('Người được giao lớp phải là tài khoản giảng viên.');
    }
    if (!row.is_active) {
      throw new BadRequestException('Tài khoản giảng viên này đã bị vô hiệu hoá nên không giao lớp được.');
    }
    return { name: row.name as string };
  }

  private async assertGroupFree(
    manager: EntityManager,
    semesterId: string | null,
    administrativeClassId: string | null,
    groupName: string,
    excludeId: string | null,
  ): Promise<void> {
    if (!semesterId || !administrativeClassId) return; // lớp cũ chưa đủ khoá: DB không có gì để so
    const [row] = await manager.query(
      `SELECT cl.label_with_semester AS label
         FROM examcollect.class c
         JOIN examcollect.class_label cl ON cl.class_id = c.id
        WHERE c.semester_id = $1 AND c.administrative_class_id = $2
          -- lower(): khớp chỉ mục duy nhất uq_class_semester_admin_group (review cụm 1, I3) — "Nhóm 1" và "nhóm 1" là MỘT nhóm.
          AND lower(c.group_name) = lower($3)
          AND ($4::uuid IS NULL OR c.id <> $4)`,
      [semesterId, administrativeClassId, groupName, excludeId],
    );
    if (row) throw new ConflictException(`Đã có lớp ${row.label}.`);
  }

  private async readAdminRow(manager: EntityManager, id: string): Promise<ClassAdminView> {
    const rows = await this.queryAdminRows(`WHERE c.id = $1`, [id], manager);
    if (rows.length === 0) throw new NotFoundException('Không tìm thấy lớp.');
    return rows[0];
  }

  private async queryAdminRows(
    where: string,
    params: unknown[],
    db: { query(sql: string, params?: unknown[]): Promise<any> } = this.dataSource, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<ClassAdminView[]> {
    const rows: Array<Omit<AdminRow, 'studentCount' | 'sessionCount'> & { studentCount: string; sessionCount: string }> =
      await db.query(
        `SELECT c.id,
                cl.label,
                cl.label_with_semester AS "labelWithSemester",
                sem.id AS "semesterId",
                sem.academic_year_start AS "academicYear",
                sem.term,
                ac.id AS "administrativeClassId",
                ac.code::text AS "administrativeClassCode",
                c.group_name AS "groupName",
                c.teacher_id AS "teacherId",
                t.name AS "teacherName",
                (SELECT count(*) FROM examcollect.enrollment e WHERE e.home_class_id = c.id) AS "studentCount",
                (SELECT count(*) FROM examcollect.exam_session s WHERE s.class_id = c.id) AS "sessionCount"
           FROM examcollect.class c
           JOIN examcollect.class_label cl ON cl.class_id = c.id
           JOIN examcollect.account t ON t.id = c.teacher_id
           LEFT JOIN examcollect.semester sem ON sem.id = c.semester_id
           LEFT JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
          ${where}
          ORDER BY sem.academic_year_start DESC NULLS LAST, sem.term DESC NULLS LAST, cl.label`,
        params,
      );
    return rows.map((row) => ({
      ...row,
      studentCount: parseInt(row.studentCount, 10),
      sessionCount: parseInt(row.sessionCount, 10),
    }));
  }
}
