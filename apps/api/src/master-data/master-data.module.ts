import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';

@Module({
  imports: [SubjectsModule],
})
export class MasterDataModule {}
