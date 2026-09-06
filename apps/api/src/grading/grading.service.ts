import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GradingResultEntity } from './entities/grading-result.entity';
import { RubricCriterionEntity } from './entities/rubric-criterion.entity';
import { SubmissionEntity } from '../submission/entities/submission.entity';
import { ExamSessionEntity } from '../exam-session/entities/exam-session.entity';
import { RequiredDeliverableEntity } from '../exam-session/entities/required-deliverable.entity';
import { StorageService } from '../storage/storage.service';
import { RubricService } from './rubric.service';
import {
  AI_GRADING_PROVIDER,
  AIGradingProvider,
  GradingRequest,
} from './ai-provider/ai-grading-provider';
import { extractText } from './extract-text';
import { AUTO_APPROVE_CONFIDENCE } from './grading.types';

export interface StartGradingResult {
  rubricId: string;
  rubricVersion: number;
  queued: number;
  alreadyGraded: number;
}

/**
 * The GRADING half of the system, and the boundary in front of it.
 *
 * CLAUDE.md is unambiguous that collection and grading are two pipelines
 * joined by one explicit teacher action, and that they must never be one
 * continuous job. That is why nothing here is reachable from the collection
 * path: `startGrading` is called by a controller, from a click, and by
 * nothing else. A submission reaching `collected` triggers exactly nothing.
 */
@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    @InjectRepository(GradingResultEntity)
    private readonly results: Repository<GradingResultEntity>,
    @InjectRepository(SubmissionEntity)
    private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(RubricCriterionEntity)
    private readonly criteria: Repository<RubricCriterionEntity>,
    @InjectRepository(RequiredDeliverableEntity)
    private readonly deliverables: Repository<RequiredDeliverableEntity>,
    private readonly rubrics: RubricService,
    private readonly storage: StorageService,
    @Inject(AI_GRADING_PROVIDER) private readonly provider: AIGradingProvider,
  ) {}

  /**
   * The explicit action. Creates one grading result per collected
   * submission and grades them.
   *
   * Only `collected` submissions are eligible: `invalid` means a required
   * file was missing, and grading a submission that is not there produces a
   * zero that reads like a judgement about the work.
   *
   * Idempotent by omission — a submission that already has a result is
   * skipped rather than re-graded. A teacher clicking twice must not
   * produce two AI opinions on one piece of work, and re-grading is a
   * separate decision that would need its own audit trail.
   */
  async startGrading(
    session: ExamSessionEntity,
    teacherId: string,
  ): Promise<StartGradingResult> {
    // The rubric this session is graded against was decided when the paper
    // was written, and is read back here — never resolved now. That is the
    // whole difference from the old findActive(courseId): editing the
    // course's rubric between two exams must not change how the earlier one
    // is graded, and a colleague teaching another class of the same course
    // must not be able to change it from under this session either.
    if (!session.rubricId) {
      throw new BadRequestException(
        'Phiên thi này chưa gắn rubric — hãy gắn rubric trước khi chấm.',
      );
    }
    const rubric = await this.rubrics.findById(session.rubricId);
    if (!rubric) {
      // The FK is ON DELETE RESTRICT, so this is unreachable through any
      // supported path. Reported rather than assumed away: a 400 naming the
      // cause beats a TypeError on the next line.
      throw new BadRequestException(
        'Rubric của phiên thi này không còn tồn tại.',
      );
    }

    const criteria = await this.criteria.find({
      where: { rubricId: rubric.id },
      order: { createdAt: 'ASC' },
    });
    if (criteria.length === 0) {
      throw new BadRequestException('Rubric đang dùng không có tiêu chí nào.');
    }

    const collected = await this.submissions.find({
      where: { examSessionId: session.id, status: 'collected' },
    });
    if (collected.length === 0) {
      return { rubricId: rubric.id, rubricVersion: rubric.version, queued: 0, alreadyGraded: 0 };
    }

    const existing = await this.results.find({
      where: { submissionId: In(collected.map((s) => s.id)) },
      select: { submissionId: true },
    });
    const alreadyGraded = new Set(existing.map((row) => row.submissionId));
    const todo = collected.filter((submission) => !alreadyGraded.has(submission.id));

    // The declared filename is the ONLY place the file's format is
    // recorded. A submission's storage key is
    // `submissions/{session}/{mssv}/{deliverableId}` — deliberately built
    // from ids so nothing user-typed can steer it, which also means it
    // carries no extension and cannot tell an extractor what it is holding.
    const filenames = new Map(
      (await this.deliverables.find({ where: { examSessionId: session.id } })).map(
        (deliverable) => [deliverable.id, deliverable.requiredFilename],
      ),
    );

    for (const submission of todo) {
      await this.gradeOne(
        submission,
        filenames.get(submission.requiredDeliverableId) ?? '',
        rubric.id,
        criteria,
        teacherId,
      );
    }

    return {
      rubricId: rubric.id,
      rubricVersion: rubric.version,
      queued: todo.length,
      alreadyGraded: alreadyGraded.size,
    };
  }

  /**
   * One submission, through the whole lifecycle.
   *
   * Three separate writes, because the database enforces the transitions
   * one at a time (`trg_grading_result_lifecycle`): a row is created in
   * `ai_grading`, moves to `ai_graded` when the model answers, and only
   * then to `auto_approved` or `flagged_for_review`. Writing the end state
   * directly would be rejected — correctly, because a row that is
   * `auto_approved` without ever having been `ai_grading` never had a model
   * look at it.
   *
   * Run inline for now. The queue this becomes is a real piece of work
   * (BullMQ, one job per submission, retries) and is deliberately not in
   * this slice — but the shape here is already one call per submission, so
   * the change is where `gradeOne` is invoked from, not what it does.
   */
  private async gradeOne(
    submission: SubmissionEntity,
    /**
     * The declared name, e.g. `Cau1.docx` or the pattern `{MSSV}_bai.docx`.
     * Only its extension is used, and a pattern's extension is still at the
     * end of it.
     */
    requiredFilename: string,
    rubricId: string,
    criteria: RubricCriterionEntity[],
    teacherId: string,
  ): Promise<void> {
    const result = await this.results.save(
      this.results.create({
        submissionId: submission.id,
        rubricIdVersion: rubricId,
        gradingTriggeredBy: teacherId,
        status: 'ai_grading',
      }),
    );

    let content = '';
    try {
      if (!submission.storageKey) {
        // A collected submission with no object behind it should not exist —
        // the lifecycle trigger will not let one through. Treated as
        // unreadable rather than thrown, so one impossible row cannot stop
        // the other thirty-nine from being graded.
        throw new Error('collected submission has no storage key');
      }
      const bytes = await this.storage.getObject(submission.storageKey);
      content = await extractText(bytes, requiredFilename);
    } catch (error) {
      // Not fatal, and not scored zero either: an unreadable file is a fact
      // about the extraction, never a judgement about the work. It reaches
      // the provider as empty content, which is what sends it to a human.
      this.logger.warn(
        `could not read ${submission.storageKey} for grading: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const request: GradingRequest = {
      studentMssv: submission.studentMssv,
      content,
      deliverableType: 'document',
      criteria: criteria.map((criterion) => ({
        id: criterion.id,
        description: criterion.description,
        maxPoints: Number(criterion.maxPoints),
      })),
    };

    const outcome = await this.provider.grade(request);

    // The AI's own output, written once. A teacher's later edit creates a
    // TeacherReview row instead of touching any of this — Security rule 6,
    // enforced by trg_grading_result_guard_ai_immutable as well as here.
    await this.results.update(result.id, {
      status: 'ai_graded',
      modelUsed: outcome.modelUsed,
      criterionResults: outcome.criterionResults,
      aiTotalScore: String(outcome.totalScore),
      confidence: String(outcome.confidence),
    });

    const confident = outcome.confidence >= AUTO_APPROVE_CONFIDENCE;
    await this.results.update(result.id, {
      status: confident ? 'auto_approved' : 'flagged_for_review',
      flagForReview: !confident,
    });
  }

  /**
   * Has anything in this session been graded yet.
   *
   * Deliberately NOT `RubricService.hasResults(rubricId)` — that counts
   * results for a rubric VERSION across the whole system, and the question
   * here is about one SESSION. A rubric shared by two sessions would make
   * the wrong one answer true.
   *
   * This is what closes the window on changing a session's rubric: once a
   * result cites a version, swapping the rubric rewrites grading history.
   */
  async hasResultsForSession(examSessionId: string): Promise<boolean> {
    const count = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .where('s.exam_session_id = :id', { id: examSessionId })
      .limit(1)
      .getCount();
    return count > 0;
  }

  /** Results for one session, newest submission first. */
  async listForSession(examSessionId: string): Promise<GradingResultView[]> {
    const rows = await this.results
      .createQueryBuilder('g')
      .innerJoin('submission', 's', 's.id = g.submission_id')
      .addSelect(['s.student_mssv AS "studentMssv"', 's.student_name_input AS "studentName"'])
      .where('s.exam_session_id = :id', { id: examSessionId })
      .orderBy('s.student_mssv', 'ASC')
      .getRawAndEntities<{ studentMssv: string; studentName: string }>();

    return rows.entities.map((entity, index) => ({
      id: entity.id,
      submissionId: entity.submissionId,
      studentMssv: rows.raw[index].studentMssv,
      studentName: rows.raw[index].studentName,
      status: entity.status,
      modelUsed: entity.modelUsed,
      aiTotalScore: entity.aiTotalScore === null ? null : Number(entity.aiTotalScore),
      confidence: entity.confidence === null ? null : Number(entity.confidence),
      flagForReview: entity.flagForReview,
      criterionResults: entity.criterionResults,
    }));
  }
}

export interface GradingResultView {
  id: string;
  submissionId: string;
  studentMssv: string;
  studentName: string;
  status: string;
  modelUsed: string | null;
  aiTotalScore: number | null;
  confidence: number | null;
  flagForReview: boolean;
  criterionResults: unknown[];
}
