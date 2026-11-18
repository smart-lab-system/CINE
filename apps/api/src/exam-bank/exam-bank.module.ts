import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseExamEntity } from './entities/course-exam.entity';
import { CourseExamQuestionEntity } from './entities/course-exam-question.entity';
import { CourseEntity } from '../master-data/entities/course.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { GradingModule } from '../grading/grading.module';
import { ExamBankService } from './exam-bank.service';
import { ExamBankController } from './exam-bank.controller';
import { ImportDsaVi03Service } from './dsa-import/import-dsa-vi03.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseExamEntity,
      CourseExamQuestionEntity,
      CourseEntity,
      ClassEntity,
      RubricEntity,
    ]),
    GradingModule,
  ],
  controllers: [ExamBankController],
  providers: [ExamBankService, ImportDsaVi03Service],
  exports: [ExamBankService, ImportDsaVi03Service],
})
export class ExamBankModule {}
