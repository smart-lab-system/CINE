import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CourseEntity } from './entities/course.entity';
import { ClassEntity } from './entities/class.entity';
import { CourseView } from './course.types';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';

@Injectable()
export class CourseService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
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
  async assignOwner(id: string, departmentHeadId: string): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    course.departmentHeadId = departmentHeadId;
    return this.courses.save(course);
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
