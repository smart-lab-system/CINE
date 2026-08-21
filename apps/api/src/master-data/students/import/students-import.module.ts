import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StudentsModule } from '../students.module';
import { StudentsImportController } from './students-import.controller';
import { StudentsImportProcessor } from './students-import.processor';
import { STUDENTS_IMPORT_QUEUE } from './students-import.constants';

@Module({
  imports: [StudentsModule, BullModule.registerQueue({ name: STUDENTS_IMPORT_QUEUE })],
  controllers: [StudentsImportController],
  providers: [StudentsImportProcessor],
})
export class StudentsImportModule {}
