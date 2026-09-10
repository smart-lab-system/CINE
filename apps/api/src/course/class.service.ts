import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { CourseEntity } from './entities/course.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { CreateClassDto, UpdateClassDto } from './dto/course.dto';
import { DepartmentTeacherView, TeachingClassView } from './course.types';

/**
 * A class has no scope column of its own: it inherits the department through
 * `course_id`. Every method here therefore starts by proving the caller owns
 * the course, which is the single place that decision is made.
 */
@Injectable()
export class ClassService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Every class under every course this head owns. */
  async findForHead(headId: string): Promise<ClassEntity[]> {
    const owned = await this.courses.find({
      where: { departmentHeadId: headId },
      select: { id: true },
    });
    if (owned.length === 0) {
      return [];
    }
    // One query with an IN, not one per course.
    return this.classes.find({
      where: { courseId: In(owned.map((c) => c.id)) },
      order: { name: 'ASC' },
    });
  }

  /**
   * The teachers currently assigned to at least one class under a course
   * this head owns — QA-reported gap (point 7). There is no direct
   * account<->department relation to query (see course.types.ts's
   * DepartmentTeacherView doc comment): derived by the same join
   * findForHead already does (course.department_head_id = headId), one
   * level further down to class.teacher_id, deduped and counted.
   */
  async findTeachersForHead(headId: string): Promise<DepartmentTeacherView[]> {
    const owned = await this.courses.find({
      where: { departmentHeadId: headId },
      select: { id: true },
    });
    if (owned.length === 0) {
      return [];
    }

    const raw = await this.classes
      .createQueryBuilder('k')
      .innerJoin('k.teacher', 'teacher')
      .select('teacher.id', 'teacherId')
      .addSelect('teacher.name', 'teacherName')
      .addSelect('teacher.email', 'teacherEmail')
      .addSelect('COUNT(DISTINCT k.id)', 'classCount')
      .where('k.courseId IN (:...courseIds)', { courseIds: owned.map((c) => c.id) })
      .groupBy('teacher.id')
      .addGroupBy('teacher.name')
      .addGroupBy('teacher.email')
      .orderBy('teacher.name', 'ASC')
      .getRawMany<{
        teacherId: string;
        teacherName: string;
        teacherEmail: string;
        classCount: string;
      }>();

    return raw.map((row) => ({
      id: row.teacherId,
      name: row.teacherName,
      email: row.teacherEmail,
      classCount: parseInt(row.classCount, 10),
    }));
  }

  /**
   * Classes this lecturer teaches, shaped for the create-session form: the
   * course they belong to and how many students the roster holds.
   *
   * One query with a JOIN and a GROUP BY, not a count per row — this list is
   * fetched on every visit to the form, and the capacity warning needs the
   * number for whichever class the lecturer picks, not just the first.
   *
   * A `studentCount` of 0 is meaningful rather than empty: it says nobody
   * has imported a roster for that class yet, which the form surfaces.
   */
  async findForTeacher(
    teacherId: string,
    semesterId?: string,
  ): Promise<TeachingClassView[]> {
    const qb = this.classes
      .createQueryBuilder('k')
      .innerJoinAndSelect('k.course', 'course')
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .addSelect('COUNT(e.id)', 'studentCount')
      .where('k.teacherId = :teacherId', { teacherId });

    // AND vào owner-scope, không thay thế nó: bộ lọc kỳ chỉ HẸP tầm nhìn
    // của giảng viên trong phạm vi họ vốn đã được phép thấy. Một `orWhere`
    // ở đây sẽ mở lớp của người khác ra.
    if (semesterId) {
      qb.andWhere('course.semesterId = :semesterId', { semesterId });
    }

    const { entities, raw } = await qb
      .groupBy('k.id')
      .addGroupBy('course.id')
      .orderBy('course.code', 'ASC')
      .addOrderBy('k.name', 'ASC')
      .getRawAndEntities<{ studentCount: string }>();

    return entities.map((klass, index) => ({
      id: klass.id,
      name: klass.name,
      courseId: klass.courseId,
      courseCode: klass.course.code,
      courseName: klass.course.name,
      studentCount: parseInt(raw[index].studentCount, 10),
    }));
  }

  /**
   * The class, if this lecturer is the one who teaches it — 404 when it does
   * not exist, 403 when it is a colleague's.
   *
   * `class.teacher_id` is the whole of a lecturer's scope, so this is what
   * stands between them and creating an exam session for someone else's
   * class. Same 404-then-403 shape as ExamSessionService.findByIdForOwner,
   * for the same reason: a 403 on a class that does not exist would confirm
   * that some other lecturer's class has that id.
   */
  async findTaughtBy(id: string, teacherId: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
    if (klass.teacherId !== teacherId) {
      throw new ForbiddenException('You do not teach this class');
    }
    return klass;
  }

  /**
   * The class, for anyone allowed to LOOK at its roster.
   *
   * Two roles reach the same list by two different routes — a lecturer
   * through `class.teacher_id`, a Trưởng khoa through the course they own —
   * and neither is allowed to see anyone else's. Writing is narrower and
   * goes through findTaughtBy: exactly one writer per list.
   */
  async findReadableBy(
    id: string,
    accountId: string,
    role: string,
  ): Promise<ClassEntity> {
    return role === 'department_admin'
      ? this.findOwnedByHead(id, accountId)
      : this.findTaughtBy(id, accountId);
  }

  async createForHead(headId: string, dto: CreateClassDto): Promise<ClassEntity> {
    await this.assertOwnsCourse(dto.courseId, headId);
    await this.assertIsTeacher(dto.teacherId);
    return this.classes.save(this.classes.create(dto));
  }

  async updateForHead(
    id: string,
    headId: string,
    dto: UpdateClassDto,
  ): Promise<ClassEntity> {
    const klass = await this.findOwnedByHead(id, headId);
    if (dto.teacherId) {
      await this.assertIsTeacher(dto.teacherId);
    }

    const lecturerChanged =
      dto.teacherId !== undefined && dto.teacherId !== klass.teacherId;
    Object.assign(klass, dto);

    if (!lecturerChanged) {
      return this.classes.save(klass);
    }

    // enrollment.home_teacher_id is copied onto every submission the student
    // makes, so a class that changes lecturer while its roster still points
    // at the previous one routes work to someone who no longer teaches it.
    // One transaction: the class and its roster must never disagree.
    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(ClassEntity, klass);
      await manager.update(
        EnrollmentEntity,
        { homeClassId: saved.id },
        { homeTeacherId: saved.teacherId },
      );
      return saved;
    });
  }

  async removeForHead(id: string, headId: string): Promise<void> {
    const klass = await this.findOwnedByHead(id, headId);
    // enrollment.home_class_id is ON DELETE RESTRICT, so a class that still
    // has students refuses to go — a 409, never a silent orphaning of the
    // roster.
    await this.classes.remove(klass);
  }

  /**
   * The class, if it belongs to a course this head owns — 404 when it does
   * not exist at all, 403 when it exists but is someone else's. Public
   * because the roster endpoints hang off a class and must answer ownership
   * the same way, in the same place, rather than re-deriving the rule.
   */
  async findOwnedByHead(id: string, headId: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
    await this.assertOwnsCourse(klass.courseId, headId);
    return klass;
  }

  private async assertOwnsCourse(courseId: string, headId: string): Promise<void> {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.departmentHeadId !== headId) {
      throw new ForbiddenException('You do not own this course');
    }
  }

  private async assertIsTeacher(accountId: string): Promise<void> {
    const account = await this.accounts.findOne({ where: { id: accountId } });
    if (!account) {
      throw new BadRequestException('Lecturer account not found');
    }
    if (account.role !== 'teacher') {
      throw new BadRequestException('A class must be assigned to a teacher account');
    }
  }
}
