import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseExamEntity } from './entities/course-exam.entity';
import { CourseExamQuestionEntity } from './entities/course-exam-question.entity';
import { CourseEntity } from '../master-data/entities/course.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { ExamBankService } from './exam-bank.service';
import { ExamBankController } from './exam-bank.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseExamEntity,
      CourseExamQuestionEntity,
      CourseEntity,
      ClassEntity,
      RubricEntity,
    ]),
  ],
  controllers: [ExamBankController],
  providers: [ExamBankService],
  exports: [ExamBankService],
})
export class ExamBankModule {}
