import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CourseEntity } from './entities/course.entity';
import { SemesterEntity } from './entities/semester.entity';
import { CourseExamEntity } from '../exam-bank/entities/course-exam.entity';
import { CourseExamQuestionEntity } from '../exam-bank/entities/course-exam-question.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../grading/entities/rubric-criterion.entity';
import { RubricApproachEntity } from '../grading/entities/rubric-approach.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import {
  matchesResolvedSemester,
  resolveSemester,
  type SemesterRange,
} from './resolve-semester';

type RangeWithName = SemesterRange & { name: string };

export interface CourseHubExamView {
  id: string;
  title: string;
  examType: string;
  status: string;
  language: string;
  questionCount: number;
  totalPoints: number;
  createdBy: string;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedSemesterId: string | null;
  resolvedSemesterName: string | null;
}

export interface CourseHubRubricView {
  id: string;
  name: string;
  version: number;
  isActive: boolean;
  kind: 'qa' | 'qs';
  teacherId: string;
  teacherName: string | null;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
  resolvedSemesterId: string | null;
  resolvedSemesterName: string | null;
}

export interface CourseHubExamDetailView extends CourseHubExamView {
  description: string | null;
  courseCode: string;
  courseName: string;
  questions: {
    id: string;
    ordinal: number;
    title: string | null;
    statement: string;
    points: number;
    rubricId: string | null;
    rubricName: string | null;
  }[];
}

export interface CourseHubRubricDetailView extends CourseHubRubricView {
  criteria: {
    id: string;
    key: string;
    description: string;
    maxPoints: number;
    approachKey: string | null;
  }[];
  approaches: {
    key: string;
    name: string;
    maxPoints: number;
    steps: { key: string; description: string; maxPoints: number }[];
  }[];
}

@Injectable()
export class CourseHubService {
  constructor(
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesters: Repository<SemesterEntity>,
    @InjectRepository(CourseExamEntity)
    private readonly exams: Repository<CourseExamEntity>,
    @InjectRepository(CourseExamQuestionEntity)
    private readonly questions: Repository<CourseExamQuestionEntity>,
    @InjectRepository(RubricEntity)
    private readonly rubrics: Repository<RubricEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(RubricApproachEntity)
    private readonly approaches: Repository<RubricApproachEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
  ) {}

  async listExams(
    courseId: string,
    opts: { semesterId?: string; academicYearId?: string },
  ): Promise<CourseHubExamView[]> {
    await this.requireCourse(courseId);
    const ranges = await this.loadSemesterRanges(opts.academicYearId);
    const exams = await this.exams.find({
      where: { courseId },
      order: { updatedAt: 'DESC' },
    });

    const creatorIds = [...new Set(exams.map((e) => e.createdBy))];
    const creators =
      creatorIds.length === 0
        ? []
        : await this.accounts.find({ where: { id: In(creatorIds) } });
    const creatorMap = new Map(creators.map((a) => [a.id, a.name ?? a.email ?? null]));

    const out: CourseHubExamView[] = [];
    for (const exam of exams) {
      if (
        opts.semesterId &&
        !matchesResolvedSemester(exam.createdAt, exam.updatedAt, opts.semesterId, ranges)
      ) {
        continue;
      }
      const resolved = resolveSemester(exam.createdAt, exam.updatedAt, ranges);
      const qCount = await this.questions.count({ where: { courseExamId: exam.id } });
      out.push({
        id: exam.id,
        title: exam.title,
        examType: exam.examType,
        status: exam.status,
        language: exam.language,
        questionCount: qCount,
        totalPoints: Math.round(exam.totalPointsHundredths) / 100,
        createdBy: exam.createdBy,
        createdByName: creatorMap.get(exam.createdBy) ?? null,
        createdAt: exam.createdAt.toISOString(),
        updatedAt: exam.updatedAt.toISOString(),
        resolvedSemesterId: resolved?.id ?? null,
        resolvedSemesterName: resolved
          ? (ranges.find((r) => r.id === resolved.id)?.name ?? null)
          : null,
      });
    }
    return out;
  }

  async listRubrics(
    courseId: string,
    opts: { semesterId?: string; academicYearId?: string },
  ): Promise<CourseHubRubricView[]> {
    await this.requireCourse(courseId);
    const ranges = await this.loadSemesterRanges(opts.academicYearId);
    const rows = await this.rubrics.find({
      where: { courseId },
      order: { name: 'ASC', version: 'DESC' },
    });

    const teacherIds = [...new Set(rows.map((r) => r.teacherId))];
    const teachers =
      teacherIds.length === 0
        ? []
        : await this.accounts.find({ where: { id: In(teacherIds) } });
    const teacherMap = new Map(teachers.map((a) => [a.id, a.name ?? a.email ?? null]));

    const out: CourseHubRubricView[] = [];
    for (const row of rows) {
      if (
        opts.semesterId &&
        !matchesResolvedSemester(row.createdAt, row.updatedAt, opts.semesterId, ranges)
      ) {
        continue;
      }
      const resolved = resolveSemester(row.createdAt, row.updatedAt, ranges);
      const criteria: { total: string }[] = await this.rubrics.manager.query(
        `SELECT COALESCE(SUM(max_points::numeric), 0) AS total
           FROM examcollect.rubric_criterion WHERE rubric_id = $1`,
        [row.id],
      );
      out.push({
        id: row.id,
        name: row.name,
        version: row.version,
        isActive: row.isActive,
        kind: (row.kind ?? 'qa') as 'qa' | 'qs',
        teacherId: row.teacherId,
        teacherName: teacherMap.get(row.teacherId) ?? null,
        totalPoints: Number(criteria[0]?.total ?? 0),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        resolvedSemesterId: resolved?.id ?? null,
        resolvedSemesterName: resolved
          ? (ranges.find((r) => r.id === resolved.id)?.name ?? null)
          : null,
      });
    }
    return out;
  }

  async getExam(courseId: string, examId: string): Promise<CourseHubExamDetailView> {
    const course = await this.requireCourse(courseId);
    const exam = await this.exams.findOne({ where: { id: examId, courseId } });
    if (!exam) throw new NotFoundException('Exam not found');

    const creator = await this.accounts.findOne({ where: { id: exam.createdBy } });
    const ranges = await this.loadSemesterRanges();
    const resolved = resolveSemester(exam.createdAt, exam.updatedAt, ranges);
    const questions = await this.questions.find({
      where: { courseExamId: exam.id },
      order: { ordinal: 'ASC' },
    });
    const rubricIds = questions
      .map((q) => q.rubricId)
      .filter((id): id is string => Boolean(id));
    const rubricRows =
      rubricIds.length === 0
        ? []
        : await this.rubrics.find({ where: { id: In(rubricIds) } });
    const rubricNames = new Map(rubricRows.map((r) => [r.id, r.name]));

    return {
      id: exam.id,
      title: exam.title,
      examType: exam.examType,
      status: exam.status,
      language: exam.language,
      questionCount: questions.length,
      totalPoints: Math.round(exam.totalPointsHundredths) / 100,
      createdBy: exam.createdBy,
      createdByName: creator?.name ?? creator?.email ?? null,
      createdAt: exam.createdAt.toISOString(),
      updatedAt: exam.updatedAt.toISOString(),
      resolvedSemesterId: resolved?.id ?? null,
      resolvedSemesterName: resolved
        ? (ranges.find((r) => r.id === resolved.id)?.name ?? null)
        : null,
      description: exam.description,
      courseCode: course.code,
      courseName: course.name,
      questions: questions.map((q) => ({
        id: q.id,
        ordinal: q.ordinal,
        title: q.title,
        statement: q.statement,
        points: Math.round(q.pointsHundredths) / 100,
        rubricId: q.rubricId,
        rubricName: q.rubricId ? (rubricNames.get(q.rubricId) ?? null) : null,
      })),
    };
  }

  async getRubric(courseId: string, rubricId: string): Promise<CourseHubRubricDetailView> {
    await this.requireCourse(courseId);
    const row = await this.rubrics.findOne({ where: { id: rubricId, courseId } });
    if (!row) throw new NotFoundException('Rubric not found');

    const teacher = await this.accounts.findOne({ where: { id: row.teacherId } });
    const ranges = await this.loadSemesterRanges();
    const resolved = resolveSemester(row.createdAt, row.updatedAt, ranges);
    const kind = (row.kind ?? 'qa') as 'qa' | 'qs';

    const criteria = await this.criteria.find({
      where: { rubricId: row.id },
      order: { sortOrder: 'ASC', createdAt: 'ASC', key: 'ASC' },
    });
    const approachRows =
      kind === 'qs'
        ? await this.approaches.find({
            where: { rubricId: row.id },
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
          })
        : [];
    const approachKeyById = new Map(approachRows.map((a) => [a.id, a.key]));
    const approaches = approachRows.map((a) => {
      const steps = criteria
        .filter((c) => c.approachId === a.id)
        .map((c) => ({
          key: c.key,
          description: c.description,
          maxPoints: Number(c.maxPoints),
        }));
      return {
        key: a.key,
        name: a.name,
        maxPoints: Math.round(steps.reduce((s, st) => s + st.maxPoints, 0) * 100) / 100,
        steps,
      };
    });
    const totalPoints =
      kind === 'qs' && approaches.length > 0
        ? Math.max(...approaches.map((a) => a.maxPoints))
        : Math.round(criteria.reduce((sum, c) => sum + Number(c.maxPoints), 0) * 100) / 100;

    return {
      id: row.id,
      name: row.name,
      version: row.version,
      isActive: row.isActive,
      kind,
      teacherId: row.teacherId,
      teacherName: teacher?.name ?? teacher?.email ?? null,
      totalPoints,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      resolvedSemesterId: resolved?.id ?? null,
      resolvedSemesterName: resolved
        ? (ranges.find((r) => r.id === resolved.id)?.name ?? null)
        : null,
      criteria: criteria.map((c) => ({
        id: c.id,
        key: c.key,
        description: c.description,
        maxPoints: Number(c.maxPoints),
        approachKey: c.approachId ? approachKeyById.get(c.approachId) ?? null : null,
      })),
      approaches,
    };
  }

  private async requireCourse(courseId: string): Promise<CourseEntity> {
    const course = await this.courses.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private async loadSemesterRanges(academicYearId?: string): Promise<RangeWithName[]> {
    const qb = this.semesters.createQueryBuilder('s').orderBy('s.start_date', 'ASC');
    if (academicYearId) {
      qb.where('s.academic_year_id = :academicYearId', { academicYearId });
    }
    const rows = await qb.getMany();
    return rows.map((s) => ({
      id: s.id,
      startDate: String(s.startDate).slice(0, 10),
      endDate: String(s.endDate).slice(0, 10),
      status: s.status,
      name: s.name,
    }));
  }
}
