import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseEntity } from './entities/course.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { CourseService } from './course.service';
import { EnrollmentService } from './enrollment.service';
import { CourseController } from './course.controller';

/**
 * Owns the academic structure (CLAUDE.md's module map puts Course, Semester,
 * ClassRoster and Enrollment here). `EnrollmentService` is exported because
 * ExamSessionGateway has to answer "may this student join" on every
 * `agent:join`, and that question belongs to this module's data, not to a
 * second set of repositories over the same table.
 */
@Module({
  imports: [TypeOrmModule.forFeature([CourseEntity, EnrollmentEntity])],
  controllers: [CourseController],
  providers: [CourseService, EnrollmentService],
  exports: [EnrollmentService],
})
export class CourseModule {}
