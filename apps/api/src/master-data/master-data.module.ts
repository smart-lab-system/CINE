import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../identity/entities/user.entity';
import { StoredObjectEntity } from '../exams/entities/stored-object.entity';
import { SubjectEntity } from './entities/subject.entity';
import { AcademicTermEntity } from './entities/academic-term.entity';
import { StudentEntity } from './entities/student.entity';
import { LecturerEntity } from './entities/lecturer.entity';
import { CourseSectionEntity } from './entities/course-section.entity';
import { CourseSectionEnrollmentEntity } from './entities/course-section-enrollment.entity';
import { CourseSectionFileEntity } from './entities/course-section-file.entity';
import { SubjectsController } from './subjects/subjects.controller';
import { SubjectsService } from './subjects/subjects.service';
import { AcademicTermsController } from './academic-terms/academic-terms.controller';
import { AcademicTermsService } from './academic-terms/academic-terms.service';
import { StudentsController } from './students/students.controller';
import { StudentsService } from './students/students.service';
import { LecturersController } from './lecturers/lecturers.controller';
import { LecturersService } from './lecturers/lecturers.service';
import { CourseSectionsController } from './course-sections/course-sections.controller';
import { CourseSectionsService } from './course-sections/course-sections.service';
import { RosterImportsService } from './course-sections/roster-imports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SubjectEntity,
      AcademicTermEntity,
      StudentEntity,
      LecturerEntity,
      CourseSectionEntity,
      CourseSectionEnrollmentEntity,
      CourseSectionFileEntity,
      StoredObjectEntity,
      UserEntity,
    ]),
  ],
  controllers: [
    SubjectsController,
    AcademicTermsController,
    StudentsController,
    LecturersController,
    CourseSectionsController,
  ],
  providers: [
    SubjectsService,
    AcademicTermsService,
    StudentsService,
    LecturersService,
    CourseSectionsService,
    RosterImportsService,
  ],
})
export class MasterDataModule {}
