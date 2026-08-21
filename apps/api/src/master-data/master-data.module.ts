import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';
import { LecturersModule } from './lecturers/lecturers.module';
import { StudentsModule } from './students/students.module';
import { CourseSectionsModule } from './course-sections/course-sections.module';

@Module({
  imports: [
    SubjectsModule,
    AcademicTermsModule,
    LecturersModule,
    StudentsModule,
    CourseSectionsModule,
  ],
})
export class MasterDataModule {}
