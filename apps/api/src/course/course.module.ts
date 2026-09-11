import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from './entities/course.entity';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { CourseService } from './course.service';
import { SemesterService } from './semester.service';
import { ClassService } from './class.service';
import { ClassImportService } from './class-import.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { SemesterEntity } from './entities/semester.entity';
import { EnrollmentService } from './enrollment.service';
import { RosterService } from './roster.service';
import { CourseController } from './course.controller';
import { SemesterController } from './semester.controller';
import { ClassController } from './class.controller';
import { AdminModule } from '../admin/admin.module';

/**
 * Owns the academic structure (CLAUDE.md's module map puts Course, Semester,
 * ClassRoster and Enrollment here). `EnrollmentService` is exported because
 * ExamSessionGateway has to answer "may this student join" on every
 * `agent:join`, and that question belongs to this module's data, not to a
 * second set of repositories over the same table.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseEntity,
      ClassEntity,
      EnrollmentEntity,
      SemesterEntity,
      AccountEntity,
    ]),
    // `CourseService.assignOwner` đổi quyền đọc xuống tới bài nộp của cả
    // khoa, nên phải ghi audit_log — CLAUDE.md §5.3/§7.2.6.
    AdminModule,
  ],
  controllers: [CourseController, SemesterController, ClassController],
  providers: [
    CourseService,
    SemesterService,
    ClassService,
    ClassImportService,
    EnrollmentService,
    RosterService,
  ],
  // ClassService is exported for ExamSessionService: creating a session
  // needs the lecturer's own scope on a class, and that scope is decided in
  // one place rather than re-derived against a second set of repositories.
  exports: [CourseService, ClassService, EnrollmentService],
})
export class CourseModule {}
