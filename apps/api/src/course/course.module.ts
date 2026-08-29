import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from './entities/course.entity';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { CourseService } from './course.service';
import { SemesterService } from './semester.service';
import { ClassService } from './class.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { SemesterEntity } from './entities/semester.entity';
import { EnrollmentService } from './enrollment.service';
import { CourseController } from './course.controller';
import { SemesterController } from './semester.controller';
import { ClassController } from './class.controller';

/**
 * Owns the academic structure (CLAUDE.md's module map puts Course, Semester,
 * ClassRoster and Enrollment here). `EnrollmentService` is exported because
 * ExamSessionGateway has to answer "may this student join" on every
 * `agent:join`, and that question belongs to this module's data, not to a
 * second set of repositories over the same table.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseEntity, ClassEntity, EnrollmentEntity, SemesterEntity, AccountEntity])],
  controllers: [CourseController, SemesterController, ClassController],
  providers: [CourseService, SemesterService, ClassService, EnrollmentService],
  exports: [CourseService, EnrollmentService],
})
export class CourseModule {}
