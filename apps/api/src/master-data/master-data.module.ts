import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';
import { LecturersModule } from './lecturers/lecturers.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [SubjectsModule, AcademicTermsModule, LecturersModule, StudentsModule],
})
export class MasterDataModule {}
