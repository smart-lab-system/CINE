import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';
import { LecturersModule } from './lecturers/lecturers.module';

@Module({
  imports: [SubjectsModule, AcademicTermsModule, LecturersModule],
})
export class MasterDataModule {}
