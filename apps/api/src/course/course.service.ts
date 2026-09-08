import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CourseEntity } from './entities/course.entity';
import { ClassEntity } from './entities/class.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { AuditLogService } from '../admin/audit-log.service';
import { CourseCatalogView } from './course.types';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly dataSource: DataSource,
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
   * Danh mục môn cấp trường, cho Phòng Đào tạo.
   *
   * Thay cho hai hàm trước đó: `findAll()` (không role, không lọc, không
   * consumer nào ở web) và `findUnowned()` (chỉ lọc `IS NULL`, KHÔNG lọc học
   * kỳ — đo được 157 môn chưa chủ trải 152 kỳ dồn vào một danh sách phẳng).
   * Gộp lại thì lỗi thiếu lọc kỳ hết theo CẤU TRÚC, không phải được vá: không
   * còn hàm nào đọc bảng này mà không đi qua `semesterId`.
   *
   * Một query (LEFT JOIN + GROUP BY), không phải một COUNT mỗi môn.
   */
  async findCatalog(filter: {
    semesterId?: string;
    unowned?: boolean;
  }): Promise<CourseCatalogView[]> {
    const qb = this.courses
      .createQueryBuilder('c')
      .leftJoin('enrollment', 'e', 'e.course_id = c.id')
      .leftJoin(AccountEntity, 'head', 'head.id = c.department_head_id')
      .addSelect('COUNT(e.id)', 'enrollmentCount')
      .addSelect('head.name', 'departmentHeadName')
      .groupBy('c.id')
      // `head.id` PHẢI có mặt: TypeORM tự đưa khoá chính của alias được join
      // vào SELECT, nên thiếu nó là Postgres 42803 ("must appear in the GROUP
      // BY clause"). Nhóm thêm theo khoá chính không đổi kết quả — mỗi môn có
      // tối đa một chủ — và nó làm `head.name` phụ thuộc hàm, tức hợp lệ.
      .addGroupBy('head.id')
      .addGroupBy('head.name')
      .orderBy('c.code', 'ASC');

    if (filter.semesterId) {
      qb.andWhere('c.semester_id = :semesterId', { semesterId: filter.semesterId });
    }
    if (filter.unowned) {
      qb.andWhere('c.department_head_id IS NULL');
    }

    const { entities, raw } = await qb.getRawAndEntities<{
      enrollmentCount: string;
      departmentHeadName: string | null;
    }>();

    return entities.map((course, index) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      semesterId: course.semesterId,
      departmentHeadId: course.departmentHeadId,
      departmentHeadName: raw[index].departmentHeadName ?? null,
      enrollmentCount: parseInt(raw[index].enrollmentCount, 10),
    }));
  }

  /**
   * Courses this Trưởng khoa owns. Scope is `department_head_id` and
   * nothing else: class, exam_session and enrollment all reach it through
   * `course_id`, so this one predicate scopes the whole academic tree.
   */
  /** `semesterId` AND vào `departmentHeadId`, không thay thế nó. Spec §5.1. */
  async findForHead(headId: string, semesterId?: string): Promise<CourseEntity[]> {
    return this.courses.find({
      where: {
        departmentHeadId: headId,
        ...(semesterId ? { semesterId } : {}),
      },
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

  /**
   * Phân công một môn về một Trưởng khoa.
   *
   * Hai bước kiểm mà bản trước không có, và cả hai đều là lỗ hở thật:
   *
   * 1. Người nhận PHẢI có role `department_admin`. FK là RESTRICT nên nó chỉ
   *    bảo đảm tài khoản TỒN TẠI, không bảo đảm VAI TRÒ. Gán cho một `teacher`
   *    là ca tệ nhất có thể: môn đó có `department_head_id IS NOT NULL` nên
   *    rời khỏi danh sách chưa-có-chủ, mà `/courses/mine` cũng không head nào
   *    trả về — nó biến mất khỏi MỌI màn hình, kể cả màn cứu hộ dựng ra để cứu
   *    đúng tình huống này, và không có đường sửa qua UI.
   *
   * 2. Ghi audit, trong CÙNG transaction với `save`. Phân công đổi quyền đọc
   *    của cả cây course → class → exam_session → submission — thao tác duy
   *    nhất trong hệ thống dịch chuyển được "ai đọc được bài thi của ai". Vết
   *    audit không được sống sót qua một lần ghi thất bại, và ngược lại; cùng
   *    lý do `SemesterService.setCurrent` đã làm thế.
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

    const target = await this.accounts.findOne({
      where: { id: departmentHeadId },
      select: { id: true, role: true },
    });
    if (!target || target.role !== 'department_admin') {
      throw new BadRequestException('Chỉ gán được môn cho Trưởng khoa');
    }

    const previousOwner = course.departmentHeadId;

    return this.dataSource.transaction(async (manager) => {
      course.departmentHeadId = departmentHeadId;
      const saved = await manager.getRepository(CourseEntity).save(course);

      await this.auditLog.recordUserAction(
        {
          actorId,
          action: 'course.assign_owner',
          targetType: 'course',
          targetId: course.id,
          oldValue: { departmentHeadId: previousOwner },
          newValue: { departmentHeadId, code: course.code },
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
