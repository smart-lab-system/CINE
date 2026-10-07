import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { CourseEntity } from '../master-data/entities/course.entity';
import { SemesterEntity } from '../master-data/entities/semester.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import {
  AssignCourseSectionDto,
  CreateCourseSectionDto,
  ListCourseSectionsQueryDto,
  UpdateCourseSectionDto,
} from './dto/admin-course-section.dto';

export interface CourseSectionView {
  id: string;
  /** Mã lớp = `{course.code}{001|002|…}` trong học kỳ. */
  name: string;
  courseId: string | null;
  courseName: string;
  semesterId: string | null;
  semesterName: string | null;
  teacherId: string | null;
  teacherName: string | null;
  studentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AdminCourseSectionService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(EnrollmentEntity)
    private readonly enrollments: Repository<EnrollmentEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesters: Repository<SemesterEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async list(
    query: ListCourseSectionsQueryDto,
  ): Promise<{ items: CourseSectionView[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const applyFilters = (
      qb: ReturnType<Repository<ClassEntity>['createQueryBuilder']>,
    ) => {
      qb.leftJoin('k.semester', 's').leftJoin('k.teacher', 't');

      if (query.academicYearId) {
        qb.andWhere('s.academic_year_id = :academicYearId', {
          academicYearId: query.academicYearId,
        });
      }
      if (query.semesterId) {
        qb.andWhere('k.semester_id = :semesterId', {
          semesterId: query.semesterId,
        });
      }
      if (query.courseId) {
        qb.andWhere('k.course_id = :courseId', { courseId: query.courseId });
      }
      if (query.teacherId) {
        qb.andWhere('k.teacher_id = :teacherId', {
          teacherId: query.teacherId,
        });
      }
      if (query.unassigned) {
        qb.andWhere('k.teacher_id IS NULL');
      }
      if (query.q?.trim()) {
        const q = `%${query.q.trim()}%`;
        qb.andWhere('(k.name ILIKE :q OR t.name ILIKE :q)', { q });
      }
      return qb;
    };

    const total = await applyFilters(this.classes.createQueryBuilder('k')).getCount();

    const { entities, raw } = await applyFilters(this.classes.createQueryBuilder('k'))
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .addSelect('COUNT(e.id)', 'studentCount')
      .addSelect('t.name', 'teacherName')
      .addSelect('s.name', 'semesterName')
      .groupBy('k.id')
      .addGroupBy('t.id')
      .addGroupBy('s.id')
      .orderBy('k.name', 'ASC')
      .offset((page - 1) * pageSize)
      .limit(pageSize)
      .getRawAndEntities<{
        studentCount: string;
        teacherName: string | null;
        semesterName: string | null;
      }>();

    const items = entities.map((klass, i) =>
      this.toView(klass, {
        studentCount: parseInt(raw[i].studentCount, 10),
        teacherName: raw[i].teacherName ?? null,
        semesterName: raw[i].semesterName ?? null,
      }),
    );

    return { items, total };
  }

  async findOne(id: string): Promise<CourseSectionView> {
    const klass = await this.classes.findOne({
      where: { id },
      relations: { teacher: true, semester: true },
    });
    if (!klass) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }
    const studentCount = await this.enrollments.count({
      where: { homeClassId: id },
    });
    return this.toView(klass, {
      studentCount,
      teacherName: klass.teacher?.name ?? null,
      semesterName: klass.semester?.name ?? null,
    });
  }

  /** Load entity cho roster — không check teacher. */
  async getEntity(id: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Không tìm thấy lớp học phần.');
    }
    return klass;
  }

  async create(dto: CreateCourseSectionDto): Promise<CourseSectionView> {
    const course = await this.requireCourse(dto.courseId);
    await this.requireSemester(dto.semesterId);
    let teacherId: string | null = null;
    if (dto.teacherId) {
      teacherId = await this.requireTeacher(dto.teacherId);
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const name = await this.nextSectionCode(
        manager,
        course.code,
        course.id,
        dto.semesterId,
      );
      return manager.getRepository(ClassEntity).save(
        manager.getRepository(ClassEntity).create({
          name,
          courseId: course.id,
          semesterId: dto.semesterId,
          courseName: course.name,
          teacherId,
        }),
      );
    });

    return this.findOne(saved.id);
  }

  async update(id: string, dto: UpdateCourseSectionDto): Promise<CourseSectionView> {
    if (dto.courseId === undefined && dto.semesterId === undefined) {
      return this.findOne(id);
    }

    await this.getEntity(id);
    await this.assertMetaMutable(id);

    await this.dataSource.transaction(async (manager) => {
      const row = await manager.getRepository(ClassEntity).findOne({
        where: { id },
      });
      if (!row) {
        throw new NotFoundException('Không tìm thấy lớp học phần.');
      }

      let course =
        row.courseId != null
          ? await manager.getRepository(CourseEntity).findOne({
              where: { id: row.courseId },
            })
          : null;

      if (dto.courseId !== undefined) {
        course = await manager.getRepository(CourseEntity).findOne({
          where: { id: dto.courseId },
        });
        if (!course) {
          throw new NotFoundException('Không tìm thấy môn học.');
        }
        row.courseId = course.id;
        row.courseName = course.name;
      }

      if (dto.semesterId !== undefined) {
        const semester = await manager.getRepository(SemesterEntity).findOne({
          where: { id: dto.semesterId },
        });
        if (!semester) {
          throw new NotFoundException('Không tìm thấy học kỳ.');
        }
        row.semesterId = dto.semesterId;
      }

      if (!course || !row.courseId || !row.semesterId) {
        throw new BadRequestException(
          'Lớp thiếu môn hoặc học kỳ — không đổi meta được.',
        );
      }

      // Đổi môn/kỳ → cấp mã mới trong (môn, kỳ) đích; bỏ qua chính hàng này.
      row.name = await this.nextSectionCode(
        manager,
        course.code,
        row.courseId,
        row.semesterId,
        id,
      );
      await manager.getRepository(ClassEntity).save(row);
    });

    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const klass = await this.getEntity(id);
    const students = await this.enrollments.count({ where: { homeClassId: id } });
    if (students > 0) {
      throw new ConflictException(
        'Lớp còn sinh viên trong danh sách — xoá roster trước khi xoá lớp.',
      );
    }
    if ((await this.sessionCount(id)) > 0) {
      throw new ConflictException('Lớp còn phiên thi gắn vào — không xoá được.');
    }
    await this.classes.remove(klass);
  }

  async assign(id: string, dto: AssignCourseSectionDto): Promise<CourseSectionView> {
    const teacherId = await this.requireTeacher(dto.teacherId);

    await this.dataSource.transaction(async (manager) => {
      const klass = await manager.getRepository(ClassEntity).findOne({
        where: { id },
      });
      if (!klass) {
        throw new NotFoundException('Không tìm thấy lớp học phần.');
      }
      klass.teacherId = teacherId;
      await manager.getRepository(ClassEntity).save(klass);
      await manager
        .getRepository(EnrollmentEntity)
        .createQueryBuilder()
        .update()
        .set({ homeTeacherId: teacherId })
        .where('home_class_id = :id', { id })
        .execute();
    });

    return this.findOne(id);
  }

  /** Gỡ phân công — chỉ khi chưa có phiên thi. */
  async unassign(id: string): Promise<CourseSectionView> {
    if ((await this.sessionCount(id)) > 0) {
      throw new ConflictException(
        'Lớp đã có phiên thi — không gỡ phân công được. Chỉ đổi GV (reassign).',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const klass = await manager.getRepository(ClassEntity).findOne({
        where: { id },
      });
      if (!klass) {
        throw new NotFoundException('Không tìm thấy lớp học phần.');
      }
      klass.teacherId = null;
      await manager.getRepository(ClassEntity).save(klass);
      await manager
        .getRepository(EnrollmentEntity)
        .createQueryBuilder()
        .update()
        .set({ homeTeacherId: null })
        .where('home_class_id = :id', { id })
        .execute();
    });

    return this.findOne(id);
  }

  private async assertMetaMutable(id: string): Promise<void> {
    const students = await this.enrollments.count({ where: { homeClassId: id } });
    if (students > 0 || (await this.sessionCount(id)) > 0) {
      throw new BadRequestException(
        'Không đổi môn/học kỳ khi lớp đã có sinh viên hoặc phiên thi.',
      );
    }
  }

  private async sessionCount(classId: string): Promise<number> {
    const rows: Array<{ count: string }> = await this.dataSource.query(
      `SELECT COUNT(*)::text AS count FROM examcollect.exam_session WHERE class_id = $1`,
      [classId],
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }

  /**
   * Mã lớp = `{course.code}` + 3 chữ số (001…). Thứ tự theo số lớp đã tạo
   * của cặp (môn, học kỳ); cùng mã được phép xuất hiện ở học kỳ khác.
   */
  private async nextSectionCode(
    manager: EntityManager,
    courseCode: string,
    courseId: string,
    semesterId: string,
    excludeClassId?: string,
  ): Promise<string> {
    const params: string[] = [courseId, semesterId];
    let sql = `
      SELECT name FROM examcollect.class
      WHERE course_id = $1 AND semester_id = $2
    `;
    if (excludeClassId) {
      params.push(excludeClassId);
      sql += ` AND id <> $${params.length}`;
    }
    sql += ' FOR UPDATE';

    const rows: Array<{ name: string }> = await manager.query(sql, params);
    let max = 0;
    for (const row of rows) {
      const name = row.name;
      if (!name.startsWith(courseCode)) continue;
      const suffix = name.slice(courseCode.length);
      if (/^\d{3}$/.test(suffix)) {
        max = Math.max(max, parseInt(suffix, 10));
      }
    }
    const next = max + 1;
    if (next > 999) {
      throw new ConflictException(
        'Đã hết số thứ tự lớp (999) cho môn này trong học kỳ.',
      );
    }
    return `${courseCode}${String(next).padStart(3, '0')}`;
  }

  private async requireCourse(id: string): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id } });
    if (!course) {
      throw new NotFoundException('Không tìm thấy môn học.');
    }
    return course;
  }

  private async requireSemester(id: string): Promise<SemesterEntity> {
    const semester = await this.semesters.findOne({ where: { id } });
    if (!semester) {
      throw new NotFoundException('Không tìm thấy học kỳ.');
    }
    return semester;
  }

  private async requireTeacher(id: string): Promise<string> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account || account.role !== 'teacher') {
      throw new BadRequestException('teacherId phải là tài khoản giảng viên.');
    }
    if (!account.isActive) {
      throw new BadRequestException('Tài khoản giảng viên đang bị vô hiệu hoá.');
    }
    return account.id;
  }

  private toView(
    klass: ClassEntity,
    extra: {
      studentCount: number;
      teacherName: string | null;
      semesterName: string | null;
    },
  ): CourseSectionView {
    return {
      id: klass.id,
      name: klass.name,
      courseId: klass.courseId,
      courseName: klass.courseName,
      semesterId: klass.semesterId,
      semesterName: extra.semesterName,
      teacherId: klass.teacherId,
      teacherName: extra.teacherName,
      studentCount: extra.studentCount,
      createdAt: klass.createdAt,
      updatedAt: klass.updatedAt,
    };
  }
}
