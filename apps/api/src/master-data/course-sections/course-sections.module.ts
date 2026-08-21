import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSectionEntity } from './course-section.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { AcademicTermEntity } from '../academic-terms/academic-term.entity';
import { StudentEntity } from '../students/student.entity';
import { CourseSectionEnrollmentEntity } from './enrollments/course-section-enrollment.entity';
import { CourseSectionsService } from './course-sections.service';
import { CourseSectionsController } from './course-sections.controller';
import { CourseSectionEnrollmentsService } from './enrollments/course-section-enrollments.service';
import { CourseSectionEnrollmentsController } from './enrollments/course-section-enrollments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseSectionEntity,
      SubjectEntity,
      AcademicTermEntity,
      StudentEntity,
      CourseSectionEnrollmentEntity,
    ]),
  ],
  controllers: [CourseSectionsController, CourseSectionEnrollmentsController],
  providers: [CourseSectionsService, CourseSectionEnrollmentsService],
})
export class CourseSectionsModule {}
