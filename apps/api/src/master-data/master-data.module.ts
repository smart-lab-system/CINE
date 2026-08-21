import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';

@Module({
  imports: [SubjectsModule, AcademicTermsModule],
})
export class MasterDataModule {}
