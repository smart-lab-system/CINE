import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsRelations, Repository } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { CourseEntity } from './entities/course.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { CreateClassDto, UpdateClassDto } from './dto/course.dto';
import {
  ClassWithCountsView,
  DepartmentTeacherView,
  TeachingClassView,
} from './course.types';

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

  /**
   * Every class under every course this head owns, kèm 3 cột đếm read-only
   * (CLAUDE.md §7.2.5): sĩ số roster, số phiên thi, số bài đã chấm.
   *
   * Không có ba con số này thì tầm nhìn của Trưởng khoa dừng lại đúng lúc
   * họ tạo lớp và gán giảng viên — sau đó lớp có ai học, có thi hay không,
   * chấm được bao nhiêu, họ không biết gì.
   *
   * **CHỈ ĐẾM — không bao giờ trả nội dung bài nộp hay điểm.** Đây là lần
   * đầu `department_admin` chạm tới tầng Sở hữu (§1.1), dù chỉ qua một con
   * số; ranh giới giữ tường minh bằng cách không `SELECT` bất kỳ cột nào
   * của `submission`/`grading_result` ngoài `COUNT()`. Nội dung là việc
   * của chức năng báo cáo GV→TK trong tương lai, không phải của route này.
   *
   * `COUNT(DISTINCT)` chứ không phải `COUNT`: ba `LEFT JOIN` song song
   * trên cùng một hàng lớp nhân bản hàng với nhau, nên một lớp 2 sinh
   * viên có 3 phiên thi sẽ báo sĩ số 6.
   */
  async findForHead(headId: string): Promise<ClassWithCountsView[]> {
    const owned = await this.courses.find({
      where: { departmentHeadId: headId },
      select: { id: true },
    });
    if (owned.length === 0) {
      return [];
    }

    const { entities, raw } = await this.classes
      .createQueryBuilder('k')
      .leftJoin('enrollment', 'e', 'e.home_class_id = k.id')
      .leftJoin('exam_session', 'sess', 'sess.class_id = k.id')
      // `grading_result` không có cột `exam_session_id` — nó với tới phiên
      // thi qua `submission`. Viết thành chuỗi `LEFT JOIN` phẳng sẽ nhân
      // hàng thêm một tầng nữa; subquery tương quan giữ nó ở một tầng.
      .leftJoin(
        'grading_result',
        'g',
        `g.submission_id IN (
           SELECT s.id FROM examcollect.submission s
            WHERE s.exam_session_id = sess.id
         )
         AND g.status IN ('auto_approved', 'flagged_for_review',
                          'teacher_reviewed', 'finalized', 'exported')`,
      )
      .addSelect('COUNT(DISTINCT e.id)', 'rosterCount')
      .addSelect('COUNT(DISTINCT sess.id)', 'examSessionCount')
      .addSelect('COUNT(DISTINCT g.id)', 'gradedCount')
      .where('k.courseId IN (:...courseIds)', { courseIds: owned.map((c) => c.id) })
      .groupBy('k.id')
      .orderBy('k.name', 'ASC')
      .getRawAndEntities<{
        rosterCount: string;
        examSessionCount: string;
        gradedCount: string;
      }>();

    return entities.map((klass, index) => ({
      id: klass.id,
      courseId: klass.courseId,
      name: klass.name,
      teacherId: klass.teacherId,
      rosterCount: parseInt(raw[index].rosterCount, 10),
      examSessionCount: parseInt(raw[index].examSessionCount, 10),
      gradedCount: parseInt(raw[index].gradedCount, 10),
    }));
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
  async findTaughtBy(
    id: string,
    teacherId: string,
    /**
     * Quan hệ cần nạp kèm. Mặc định KHÔNG nạp gì — ba người gọi cũ
     * (importRoster, addStudent, removeStudent) chỉ cần kiểm quyền, và
     * nạp thừa cho họ là trả tiền cho một join không ai đọc.
     *
     * `ExamSessionService.create` truyền `{ course: { semester: true } }`
     * để chụp `semester_name` trong CÙNG lượt tra lớp, thay vì bắn thêm
     * một round-trip.
     */
    relations?: FindOptionsRelations<ClassEntity>,
  ): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id }, relations });
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
   * Bản cho giảng viên của `createForHead`.
   *
   * Hai khác biệt, cả hai có chủ ý:
   *
   * 1. **Chủ sở hữu là chính người gọi.** `dto.teacherId` bị bỏ qua hoàn
   *    toàn — một giảng viên không gán lớp cho người khác được. Trưởng khoa
   *    thì gán được, và đó là lý do `createForHead` có `assertIsTeacher`.
   *
   * 2. **Không kiểm sở hữu môn học.** `createForHead` đòi trưởng khoa sở
   *    hữu môn, nhưng giảng viên không sở hữu môn nào cả — khái niệm đó
   *    thuộc về tầng khoa, thứ sắp bị cắt. Khoá ngoại vẫn ép môn phải tồn
   *    tại, nên đây là nới lỏng có kiểm soát, không phải bỏ ngỏ.
   *
   *    **Đây là trạng thái TẠM.** Khi `class.course_id` thành `course_name`
   *    dạng văn bản (spec thu hẹp master data §3.2), câu hỏi "giảng viên
   *    được tạo lớp cho môn nào" biến mất cùng bảng `course`.
   */
  async createForTeacher(teacherId: string, dto: CreateClassDto): Promise<ClassEntity> {
    return this.classes.save(
      this.classes.create({ ...dto, teacherId }),
    );
  }

  /**
   * Bản cho giảng viên của `updateForHead`, và nó ĐƠN GIẢN HƠN HẲN.
   *
   * `updateForHead` có cả một giao dịch để đồng bộ `enrollment.home_teacher_id`
   * khi lớp đổi giảng viên. Ở đây nhánh đó **không tồn tại được**: giảng
   * viên không đổi được chủ sở hữu, nên roster không bao giờ lệch.
   *
   * Cho phép đổi `teacherId` ở bản này nghĩa là một giảng viên đẩy lớp của
   * mình sang người khác rồi mất quyền, hoặc kéo lớp người khác về. Cả hai
   * đều không có ca dùng, và cả hai đều không hoàn tác được từ giao diện.
   */
  async updateForTeacher(
    id: string,
    teacherId: string,
    dto: UpdateClassDto,
  ): Promise<ClassEntity> {
    const klass = await this.findOwnedByTeacher(id, teacherId);
    // CHO PHÉP CÓ CHỌN LỌC, không phải loại trừ. `Object.assign(klass, dto)`
    // trừ đi một trường sẽ để một trường MỚI thêm vào DTO sau này âm thầm
    // lọt qua — và nếu trường đó là `teacherId` phiên bản khác tên thì lỗ
    // hổng quay lại mà không ai sửa gì ở đây.
    if (dto.name !== undefined) {
      klass.name = dto.name;
    }
    return this.classes.save(klass);
  }

  async removeForTeacher(id: string, teacherId: string): Promise<void> {
    const klass = await this.findOwnedByTeacher(id, teacherId);
    // `enrollment.home_class_id` là ON DELETE RESTRICT, nên lớp còn sinh
    // viên thì từ chối đi — một 409, không bao giờ là một roster mồ côi
    // trong im lặng.
    await this.classes.remove(klass);
  }

  /**
   * Vị từ quyền dùng chung cho ba hàm `*ForTeacher` — một chỗ để sửa, một
   * chỗ để test.
   *
   * 404 khi không tồn tại, 403 khi tồn tại nhưng của người khác. Trưởng
   * khoa trước đây thấy mọi lớp trong khoa nên `findOwnedByHead` đi qua
   * `assertOwnsCourse`; giảng viên thì so thẳng chủ sở hữu, và **bỏ sót
   * chỗ này là một giảng viên sửa được lớp của người khác**.
   */
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
