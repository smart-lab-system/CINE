import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { CourseEntity } from './entities/course.entity';
import { ClassEntity } from './entities/class.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { AuditLogService } from '../admin/audit-log.service';
import { CourseView } from './course.types';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

@Injectable()
export class CourseService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly auditLog: AuditLogService,
  ) {}

  /**
   * One class, scoped to its course. The scoping is the point: approving an
   * access request must not be able to attach a student to a class from a
   * different course, which would route their submission to a teacher who
   * never taught them.
   */
  async findClassForCourse(courseId: string, classId: string): Promise<ClassEntity | null> {
    return this.classes.findOne({ where: { id: classId, courseId } });
  }

  /**
   * One query (LEFT JOIN + GROUP BY), not one COUNT per course — avoids
   * the N+1 the create-exam-session form's capacity warning would
   * otherwise cost.
   */
  async findAll(): Promise<CourseView[]> {
    const { entities, raw } = await this.courses
      .createQueryBuilder('c')
      .leftJoin('enrollment', 'e', 'e.course_id = c.id')
      .addSelect('COUNT(e.id)', 'enrollmentCount')
      .groupBy('c.id')
      .orderBy('c.code', 'ASC')
      .getRawAndEntities<{ enrollmentCount: string }>();

    return entities.map((course, index) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      semesterId: course.semesterId,
      enrollmentCount: parseInt(raw[index].enrollmentCount, 10),
    }));
  }

  /**
   * Courses this Trưởng khoa owns. Scope is `department_head_id` and
   * nothing else: class, exam_session and enrollment all reach it through
   * `course_id`, so this one predicate scopes the whole academic tree.
   */
  async findForHead(headId: string): Promise<CourseEntity[]> {
    return this.courses.find({
      where: { departmentHeadId: headId },
      order: { code: 'ASC' },
    });
  }

  /**
   * Courses nobody owns — admin-only.
   *
   * An unowned course is listed to no Trưởng khoa, which makes it also
   * unassignable by them: without this view the seeded courses would be a
   * bootstrap deadlock, and any future orphan would go quiet instead of
   * being noticed.
   */
  async findUnowned(): Promise<CourseEntity[]> {
    return this.courses.find({
      where: { departmentHeadId: IsNull() },
      order: { code: 'ASC' },
    });
  }

  /** Ownership is taken from the caller, never from the request body. */
  async createForHead(headId: string, dto: CreateCourseDto): Promise<CourseEntity> {
    return this.courses.save(
      this.courses.create({
        code: dto.code,
        name: dto.name,
        semesterId: dto.semesterId,
        departmentHeadId: headId,
      }),
    );
  }

  async updateForHead(
    id: string,
    headId: string,
    dto: UpdateCourseDto,
  ): Promise<CourseEntity> {
    const course = await this.findOwnedBy(id, headId);
    Object.assign(course, dto);
    return this.courses.save(course);
  }

  async removeForHead(id: string, headId: string): Promise<void> {
    const course = await this.findOwnedBy(id, headId);
    // Every FK into course is ON DELETE RESTRICT, so a course with classes,
    // sessions or enrollments refuses to go and PostgresExceptionFilter
    // turns that into a 409 rather than a 500.
    await this.courses.remove(course);
  }

  /** Admin-only: hand an unowned (or reassigned) course to a head. */
  /**
   * Audit là bắt buộc ở đây, cùng lý do với
   * `ExamSessionReassignService.reassignTeacher` (CLAUDE.md §5.3 + §7.2.6):
   * `Course` là tầng Tham chiếu, nhưng đổi chủ của nó đổi luôn ai đọc được
   * `Class → Enrollment →` (qua `teacher_id`) `ExamSession` của cả khoa.
   * Phép thử ở §1.1 là "thao tác này có đổi quyền đọc xuống dưới không",
   * không phải "bảng đang sửa là bảng gì". Escape hatch không có vết là
   * escape hatch không kiểm soát được.
   *
   * Ghi trong CÙNG transaction với lần ghi cột: một dòng audit trên
   * connection khác là một đường để quyền đọc đổi chủ mà không có tên ai
   * bên cạnh — cột đã lưu, audit lỗi, không ai biết.
   */
  async assignOwner(
    id: string,
    departmentHeadId: string,
    actorId: string,
  ): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const head = await this.accounts.findOne({
      where: { id: departmentHeadId },
      select: { id: true, role: true, isActive: true },
    });
    if (!head || head.role !== 'department_admin') {
      // `findForHead` lọc theo `department_head_id`; trỏ cột này vào một
      // giảng viên hay admin tạo ra môn học không màn hình nào quản lý được
      // — đúng cái trạng thái mồ côi mà route này tồn tại để sửa.
      throw new BadRequestException('Chỉ gán được môn học cho tài khoản trưởng khoa');
    }
    if (!head.isActive) {
      throw new BadRequestException('Tài khoản trưởng khoa này đã bị vô hiệu hoá');
    }

    const previousOwnerId = course.departmentHeadId;
    if (previousOwnerId === departmentHeadId) {
      throw new BadRequestException('Môn học này đã thuộc trưởng khoa đó');
    }

    return this.dataSource.transaction(async (manager) => {
      course.departmentHeadId = departmentHeadId;
      const saved = await manager.getRepository(CourseEntity).save(course);

      await this.auditLog.recordUserAction(
        {
          actorId,
          action: 'course.assign_owner',
          targetType: 'course',
          targetId: course.id,
          // `null` khi trước đó là môn mồ côi — đó là ca thường của route
          // này, và phải đọc ra được từ sổ chứ không phải suy đoán.
          oldValue: { departmentHeadId: previousOwnerId },
          newValue: { departmentHeadId },
        },
        manager,
      );

      return saved;
    });
  }

  /**
   * 404 when it does not exist, 403 when it belongs to another head — the
   * same two-step ExamSessionService.findByIdForOwner uses, so ownership
   * reads the same way everywhere in this codebase.
   */
  private async findOwnedBy(id: string, headId: string): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.departmentHeadId !== headId) {
      throw new ForbiddenException('You do not own this course');
    }
    return course;
  }
}
