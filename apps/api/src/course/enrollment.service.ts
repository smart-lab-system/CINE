import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnrollmentEntity } from './entities/enrollment.entity';

/**
 * Enrollment is the answer to "may this student sit this exam", and from the
 * master-data scope cut it is keyed by CLASS.
 *
 * It used to be keyed by COURSE, deliberately, so a student could sit a
 * make-up exam with another class's session with no special case. The
 * `course` table is gone, so that anchor is gone with it: a student whose
 * home class is not the session's class is now refused at join and goes
 * through the ACCESS-REQUEST flow instead, where an invigilator names their
 * home class and a reason. That is a chosen behaviour change, not a
 * regression — see the master-data scope-cut spec §6.
 */
@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollments: Repository<EnrollmentEntity>,
  ) {}

  /**
   * The enrollment backing an `agent:join`, or null if the student has none
   * for this class.
   *
   * `student_mssv` is `citext`, so the comparison is case-insensitive in the
   * database — a student typing `sv20120001` is the same student as
   * `SV20120001`, and that is settled by the column type rather than by
   * anything this code does.
   */
  async findForClass(
    homeClassId: string,
    studentMssv: string,
  ): Promise<EnrollmentEntity | null> {
    return this.enrollments.findOne({ where: { homeClassId, studentMssv } });
  }

  /**
   * Adds a student the roster did not have, on an invigilator's decision.
   *
   * Approving an access request has to write this row rather than grant a
   * one-off pass: a submission is NOT NULL on home_class_id and
   * home_teacher_id, and inventing a routing at collection time is exactly
   * the guessing this project forbids. The invigilator names the class, so
   * nothing is inferred.
   *
   * The roster gaining a person is not silent — the caller writes an
   * audit_log entry naming who approved it and why.
   *
   * Idempotent against uq_enrollment_class_student: two invigilators
   * approving the same student produce one row, not a unique violation.
   */
  async addManually(input: {
    studentMssv: string;
    studentName: string;
    homeClassId: string;
    homeTeacherId: string;
  }): Promise<EnrollmentEntity> {
    await this.enrollments
      .createQueryBuilder()
      .insert()
      .values({
        studentMssv: input.studentMssv,
        studentName: input.studentName,
        homeClassId: input.homeClassId,
        homeTeacherId: input.homeTeacherId,
      })
      .orIgnore()
      .execute();

    const saved = await this.findForClass(input.homeClassId, input.studentMssv);
    if (!saved) {
      throw new Error(
        `enrollment for ${input.studentMssv} vanished immediately after insert`,
      );
    }
    return saved;
  }
}
