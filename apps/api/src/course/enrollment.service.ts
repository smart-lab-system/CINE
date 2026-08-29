import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EnrollmentEntity } from './entities/enrollment.entity';

/**
 * Enrollment is the answer to "may this student sit this exam", and it is
 * deliberately keyed by COURSE rather than by class — that is what lets a
 * student sit a make-up exam with another class's session without any
 * special case (CLAUDE.md Security rule 1).
 */
@Injectable()
export class EnrollmentService {
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollments: Repository<EnrollmentEntity>,
  ) {}

  /**
   * The enrollment backing an `agent:join`, or null if the student has none
   * for this course.
   *
   * `student_mssv` is `citext`, so the comparison is case-insensitive in the
   * database — a student typing `sv20120001` is the same student as
   * `SV20120001`, and that is settled by the column type rather than by
   * anything this code does.
   */
  async findForCourse(
    courseId: string,
    studentMssv: string,
  ): Promise<EnrollmentEntity | null> {
    return this.enrollments.findOne({ where: { courseId, studentMssv } });
  }
}
