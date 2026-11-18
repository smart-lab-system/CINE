import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RubricService } from '../../grading/rubric.service';
import { CourseEntity } from '../../master-data/entities/course.entity';
import { CourseExamEntity } from '../entities/course-exam.entity';
import { ExamBankService, type CourseExamDetailView } from '../exam-bank.service';
import type { CourseExamType } from '../exam-bank.constants';
import type { CourseExamLanguage } from '../exam-bank.constants';
import { defaultDsaDatasetRoot, loadDsaDataset } from './load-dsa-dataset';

export const DSA_IMPORT_MARKER = '[import:dsa_vi_03]';

export interface ImportDsaVi03Options {
  courseId: string;
  examType?: CourseExamType;
  language?: CourseExamLanguage;
  datasetRoot?: string;
  limit?: number;
  /**
   * Xóa các đề import cũ (chưa gắn phiên) rồi tạo lại.
   * Mặc định: true khi đã có đề marker; `--no-replace` để từ chối nếu đã có.
   */
  replace?: boolean;
  dryRun?: boolean;
}

export interface ImportDsaVi03Result {
  dryRun: boolean;
  problemCount: number;
  totalPoints: number;
  rubricNames: string[];
  /** Một đề / câu (1 câu + 1 rubric QS). */
  exams: CourseExamDetailView[];
  removedExamIds: string[];
}

@Injectable()
export class ImportDsaVi03Service {
  constructor(
    private readonly rubrics: RubricService,
    private readonly examBank: ExamBankService,
    @InjectRepository(CourseExamEntity)
    private readonly exams: Repository<CourseExamEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
  ) {}

  async importForTeacher(
    teacherId: string,
    opts: ImportDsaVi03Options,
  ): Promise<ImportDsaVi03Result> {
    const course = await this.courses.findOne({ where: { id: opts.courseId } });
    if (!course) throw new NotFoundException('Không tìm thấy môn học.');
    await this.examBank.assertTeachesCourse(teacherId, opts.courseId);

    const problems = loadDsaDataset(opts.datasetRoot ?? defaultDsaDatasetRoot(), {
      limit: opts.limit,
    });
    if (problems.length === 0) {
      throw new BadRequestException('Dataset trống.');
    }

    const examType = opts.examType ?? 'TK';
    const language = opts.language ?? 'java';
    const totalPoints =
      Math.round(problems.reduce((s, p) => s + p.points, 0) * 100) / 100;

    if (opts.dryRun) {
      return {
        dryRun: true,
        problemCount: problems.length,
        totalPoints,
        rubricNames: problems.map((p) => p.rubricName),
        exams: [],
        removedExamIds: [],
      };
    }

    const existing = await this.exams.find({
      where: { courseId: opts.courseId },
      order: { updatedAt: 'DESC' },
    });
    const marked = existing.filter((e) =>
      (e.description ?? '').includes(DSA_IMPORT_MARKER),
    );

    if (marked.length > 0 && opts.replace === false) {
      throw new BadRequestException(
        `Đã có ${marked.length} đề import dsa_vi_03. Dùng --replace (mặc định) hoặc xóa tay.`,
      );
    }

    const removedExamIds: string[] = [];
    if (marked.length > 0 && opts.replace !== false) {
      for (const e of marked) {
        await this.examBank.remove(teacherId, e.id);
        removedExamIds.push(e.id);
      }
    }

    const exams: CourseExamDetailView[] = [];
    for (const p of problems) {
      const saved = await this.rubrics.saveNewVersion(teacherId, {
        name: p.rubricName,
        kind: 'qs',
        approaches: p.approaches.map((a) => ({
          name: a.name,
          steps: a.steps.map((s) => ({
            description: s.description,
            maxPoints: s.maxPoints,
          })),
        })),
      });

      const description =
        `${DSA_IMPORT_MARKER} ${p.rubricName}. ` +
        `Chỉ question + rubric QS (không solution/sub).`;

      const exam = await this.examBank.create(teacherId, {
        courseId: opts.courseId,
        examType,
        language,
        titleDetail: p.folder,
        description,
        totalPoints: p.points,
        questions: [
          {
            title: p.name,
            statement: p.statement,
            points: p.points,
            rubricId: saved.id,
          },
        ],
      });
      exams.push(exam);
    }

    return {
      dryRun: false,
      problemCount: problems.length,
      totalPoints,
      rubricNames: problems.map((p) => p.rubricName),
      exams,
      removedExamIds,
    };
  }
}
