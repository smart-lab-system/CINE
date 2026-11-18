import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { CourseExamEntity, CourseExamStatus } from './entities/course-exam.entity';
import { CourseExamQuestionEntity } from './entities/course-exam-question.entity';
import { CourseEntity } from '../master-data/entities/course.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { CreateCourseExamDto, ExamBankQuestionDto, UpdateCourseExamDto } from './dto/exam-bank.dto';
import {
  buildCourseExamTitle,
  COURSE_EXAM_LANGUAGES,
  type CourseExamLanguage,
  type CourseExamType,
} from './exam-bank.constants';
import {
  parseCourseExamDocx,
  type ParsedCourseExamDocx,
} from './docx/parse-course-exam-docx';
import { buildCourseExamDocx } from './docx/build-course-exam-docx';

export interface CourseExamQuestionView {
  id: string;
  ordinal: number;
  title: string | null;
  statement: string;
  points: number;
  rubricId: string | null;
  rubricName: string | null;
  rubricKind: 'qa' | 'qs' | null;
}

export interface CourseExamSummaryView {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  title: string;
  examType: CourseExamType;
  status: CourseExamStatus;
  language: string;
  questionCount: number;
  /** Trần điểm đề (field tổng điểm). */
  totalPoints: number;
  /** Tổng điểm đã phân bổ cho các câu. */
  allocatedPoints: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseExamDetailView extends CourseExamSummaryView {
  /** Mô tả dùng chung cho toàn đề (có thể null). */
  description: string | null;
  questions: CourseExamQuestionView[];
}

function normalizeDescription(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

export interface TeachingCourseView {
  id: string;
  code: string;
  name: string;
}

function toPoints(hundredths: number): number {
  return Math.round(hundredths) / 100;
}

function toHundredths(points: number): number {
  return Math.round(points * 100);
}

@Injectable()
export class ExamBankService {
  constructor(
    @InjectRepository(CourseExamEntity)
    private readonly exams: Repository<CourseExamEntity>,
    @InjectRepository(CourseExamQuestionEntity)
    private readonly questions: Repository<CourseExamQuestionEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectRepository(RubricEntity)
    private readonly rubrics: Repository<RubricEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Môn mà GV đang được phân công dạy (có course_id). */
  async listTeachingCourses(teacherId: string): Promise<TeachingCourseView[]> {
    const rows: { id: string; code: string; name: string }[] = await this.classes.manager.query(
      `SELECT DISTINCT c.id, c.code, c.name
         FROM examcollect.class k
         JOIN examcollect.course c ON c.id = k.course_id
        WHERE k.teacher_id = $1 AND k.course_id IS NOT NULL
        ORDER BY c.code ASC`,
      [teacherId],
    );
    return rows;
  }

  async listByCourse(teacherId: string, courseId: string): Promise<CourseExamSummaryView[]> {
    await this.assertTeachesCourse(teacherId, courseId);
    const exams = await this.exams.find({
      where: { courseId },
      order: { updatedAt: 'DESC' },
    });
    const course = await this.requireCourse(courseId);
    const out: CourseExamSummaryView[] = [];
    for (const exam of exams) {
      out.push(await this.toSummary(exam, course));
    }
    return out;
  }

  async getOne(teacherId: string, examId: string): Promise<CourseExamDetailView> {
    const exam = await this.requireExam(examId);
    await this.assertTeachesCourse(teacherId, exam.courseId);
    const course = await this.requireCourse(exam.courseId);
    const questions = await this.questions.find({
      where: { courseExamId: exam.id },
      order: { ordinal: 'ASC' },
    });
    const summary = await this.toSummary(exam, course, questions);
    const rubricMeta = await this.loadRubricMeta(
      questions.map((q) => q.rubricId).filter((id): id is string => Boolean(id)),
    );
    return {
      ...summary,
      description: exam.description,
      questions: questions.map((q) => {
        const meta = q.rubricId ? rubricMeta.get(q.rubricId) : undefined;
        return {
          id: q.id,
          ordinal: q.ordinal,
          title: q.title,
          statement: q.statement,
          points: toPoints(q.pointsHundredths),
          rubricId: q.rubricId,
          rubricName: meta?.name ?? null,
          rubricKind: meta?.kind ?? null,
        };
      }),
    };
  }

  async create(teacherId: string, dto: CreateCourseExamDto): Promise<CourseExamDetailView> {
    await this.assertTeachesCourse(teacherId, dto.courseId);
    const course = await this.requireCourse(dto.courseId);
    const totalHundredths = toHundredths(dto.totalPoints);
    this.assertPointsFit(dto.questions, totalHundredths);
    await this.assertQuestionRubrics(teacherId, dto.questions);

    const examId = await this.dataSource.transaction(async (m) => {
      const exam = await m.save(
        m.create(CourseExamEntity, {
          courseId: dto.courseId,
          examType: dto.examType,
          title: buildCourseExamTitle(dto.examType, course.name, dto.titleDetail),
          description: normalizeDescription(dto.description),
          status: 'draft',
          language: dto.language,
          totalPointsHundredths: totalHundredths,
          createdBy: teacherId,
          updatedBy: teacherId,
        }),
      );
      await this.replaceQuestions(m, exam.id, dto.questions);
      return exam.id;
    });

    return this.getOne(teacherId, examId);
  }

  async update(teacherId: string, examId: string, dto: UpdateCourseExamDto): Promise<CourseExamDetailView> {
    const exam = await this.requireExam(examId);
    await this.assertTeachesCourse(teacherId, exam.courseId);

    if (
      dto.examType === undefined &&
      dto.language === undefined &&
      dto.totalPoints === undefined &&
      dto.description === undefined &&
      dto.status === undefined &&
      dto.questions === undefined
    ) {
      throw new BadRequestException('Không có trường nào để cập nhật.');
    }

    const course = await this.requireCourse(exam.courseId);

    await this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(CourseExamEntity);
      const row = await repo.findOne({ where: { id: examId } });
      if (!row) throw new NotFoundException('Không tìm thấy đề.');

      if (dto.examType !== undefined) {
        row.examType = dto.examType;
        row.title = buildCourseExamTitle(dto.examType, course.name);
      }
      if (dto.language !== undefined) row.language = dto.language;
      if (dto.totalPoints !== undefined) row.totalPointsHundredths = toHundredths(dto.totalPoints);
      if (dto.description !== undefined) row.description = normalizeDescription(dto.description);
      if (dto.status !== undefined) row.status = dto.status;
      row.updatedBy = teacherId;

      const questions =
        dto.questions ??
        (await m.getRepository(CourseExamQuestionEntity).find({ where: { courseExamId: examId } })).map(
          (q) => ({
            statement: q.statement,
            points: toPoints(q.pointsHundredths),
            title: q.title ?? undefined,
            rubricId: q.rubricId,
          }),
        );
      this.assertPointsFit(questions, row.totalPointsHundredths);
      if (dto.questions) {
        await this.assertQuestionRubrics(teacherId, dto.questions);
      }

      await repo.save(row);
      if (dto.questions) {
        await this.replaceQuestions(m, examId, dto.questions);
      }
    });

    return this.getOne(teacherId, examId);
  }

  /**
   * Xóa đề kho khi chưa gắn phiên thi.
   * (Chưa có FK gắn phiên ↔ course_exam — hiện cho xóa draft và ready.)
   */
  async remove(teacherId: string, examId: string): Promise<void> {
    const exam = await this.requireExam(examId);
    await this.assertTeachesCourse(teacherId, exam.courseId);
    if (await this.isAttachedToExamSession(examId)) {
      throw new BadRequestException('Không xóa được đề đã gắn vào phiên thi.');
    }
    await this.exams.delete({ id: examId });
  }

  /** Placeholder tới khi có liên kết course_exam → exam_session. */
  async isAttachedToExamSession(_examId: string): Promise<boolean> {
    return false;
  }

  /**
   * Parse Word → draft JSON (không ghi DB). GV đổ form rồi Lưu.
   */
  async parseDocx(
    teacherId: string,
    courseId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number } | undefined,
  ): Promise<ParsedCourseExamDocx> {
    await this.assertTeachesCourse(teacherId, courseId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Thiếu file Word (.docx).');
    }
    const name = (file.originalname ?? '').toLowerCase();
    if (name && !name.endsWith('.docx')) {
      throw new BadRequestException('Chỉ chấp nhận file .docx.');
    }
    if (file.size != null && file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('File vượt 5MB.');
    }
    const course = await this.requireCourse(courseId);
    return parseCourseExamDocx(file.buffer, course.name);
  }

  async exportDocx(
    teacherId: string,
    examId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const detail = await this.getOne(teacherId, examId);
    if (!(COURSE_EXAM_LANGUAGES as readonly string[]).includes(detail.language)) {
      throw new BadRequestException(`Ngôn ngữ đề không hợp lệ: ${detail.language}`);
    }
    const buffer = await buildCourseExamDocx({
      examType: detail.examType,
      courseName: detail.courseName,
      language: detail.language as CourseExamLanguage,
      description: detail.description,
      questions: detail.questions.map((q) => ({
        statement: q.statement,
        points: q.points,
        title: q.title,
      })),
    });
    const safeType = detail.examType.toLowerCase();
    const filename = `de-thi-${safeType}-${detail.courseCode}.docx`.replace(
      /[^\w.\-]+/g,
      '_',
    );
    return { buffer, filename };
  }

  async assertTeachesCourse(teacherId: string, courseId: string): Promise<void> {
    const n = await this.classes.count({ where: { teacherId, courseId } });
    if (n === 0) {
      throw new ForbiddenException('Bạn không được phân công dạy môn này.');
    }
  }

  private async requireCourse(courseId: string): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Không tìm thấy môn học.');
    return course;
  }

  private async requireExam(examId: string): Promise<CourseExamEntity> {
    const exam = await this.exams.findOne({ where: { id: examId } });
    if (!exam) throw new NotFoundException('Không tìm thấy đề.');
    return exam;
  }

  private assertPointsFit(
    questions: { points: number }[],
    totalHundredths: number,
  ): void {
    for (let i = 0; i < questions.length; i++) {
      if (!(questions[i].points > 0)) {
        throw new BadRequestException(`Câu ${i + 1}: điểm phải lớn hơn 0.`);
      }
    }
    const allocated = questions.reduce((s, q) => s + toHundredths(q.points), 0);
    if (allocated !== totalHundredths) {
      throw new BadRequestException(
        `Tổng điểm đề (${toPoints(totalHundredths)}) phải bằng điểm đã phân bổ (${toPoints(allocated)}).`,
      );
    }
  }

  private async assertQuestionRubrics(
    teacherId: string,
    questions: ExamBankQuestionDto[],
  ): Promise<void> {
    const ids = [
      ...new Set(
        questions
          .map((q) => q.rubricId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    ];
    if (ids.length === 0) return;

    const rows = await this.rubrics.find({ where: { id: In(ids) } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (let i = 0; i < questions.length; i++) {
      const rid = questions[i].rubricId;
      if (!rid) continue;
      const r = byId.get(rid);
      if (!r || r.teacherId !== teacherId) {
        throw new BadRequestException(`Câu ${i + 1}: không tìm thấy rubric hoặc không thuộc bạn.`);
      }
      if ((r.kind ?? 'qa') !== 'qs') {
        throw new BadRequestException(`Câu ${i + 1}: chỉ gắn được rubric QS (kind=qs).`);
      }
      if (!r.isActive) {
        throw new BadRequestException(`Câu ${i + 1}: rubric không còn active — chọn bản mới nhất.`);
      }
    }
  }

  private async loadRubricMeta(
    ids: string[],
  ): Promise<Map<string, { name: string; kind: 'qa' | 'qs' }>> {
    const out = new Map<string, { name: string; kind: 'qa' | 'qs' }>();
    if (ids.length === 0) return out;
    const rows = await this.rubrics.find({ where: { id: In(ids) } });
    for (const r of rows) {
      out.set(r.id, { name: r.name, kind: (r.kind ?? 'qa') as 'qa' | 'qs' });
    }
    return out;
  }

  private async replaceQuestions(
    m: EntityManager,
    examId: string,
    questions: ExamBankQuestionDto[],
  ): Promise<void> {
    await m.delete(CourseExamQuestionEntity, { courseExamId: examId });
    await m.save(
      CourseExamQuestionEntity,
      questions.map((q, index) =>
        m.create(CourseExamQuestionEntity, {
          courseExamId: examId,
          ordinal: index + 1,
          title: q.title?.trim() || null,
          statement: q.statement.trim(),
          pointsHundredths: toHundredths(q.points),
          rubricId: q.rubricId ?? null,
        }),
      ),
    );
  }

  private async toSummary(
    exam: CourseExamEntity,
    course: CourseEntity,
    questions?: CourseExamQuestionEntity[],
  ): Promise<CourseExamSummaryView> {
    const qs =
      questions ??
      (await this.questions.find({
        where: { courseExamId: exam.id },
        order: { ordinal: 'ASC' },
      }));
    const allocatedHundredths = qs.reduce((s, q) => s + q.pointsHundredths, 0);
    return {
      id: exam.id,
      courseId: exam.courseId,
      courseCode: course.code,
      courseName: course.name,
      title: exam.title,
      examType: exam.examType,
      status: exam.status,
      language: exam.language,
      questionCount: qs.length,
      totalPoints: toPoints(exam.totalPointsHundredths),
      allocatedPoints: toPoints(allocatedHundredths),
      createdAt: exam.createdAt.toISOString(),
      updatedAt: exam.updatedAt.toISOString(),
    };
  }
}
