import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicYearEntity } from './entities/academic-year.entity';
import { SemesterEntity } from './entities/semester.entity';
import { CourseEntity } from './entities/course.entity';
import { NominalClassEntity } from './entities/nominal-class.entity';
import { StudentEntity } from './entities/student.entity';
import { RoomEntity } from './entities/room.entity';
import { ComputerEntity } from './entities/computer.entity';
import { ClassEntity } from '../course/entities/class.entity';
import { EnrollmentEntity } from '../course/entities/enrollment.entity';
import { CourseExamEntity } from '../exam-bank/entities/course-exam.entity';
import { CourseExamQuestionEntity } from '../exam-bank/entities/course-exam-question.entity';
import { RubricEntity } from '../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../grading/entities/rubric-criterion.entity';
import { RubricApproachEntity } from '../grading/entities/rubric-approach.entity';
import { AccountEntity } from '../identity/entities/account.entity';
import { MasterDataService } from './master-data.service';
import { CourseHubService } from './course-hub.service';
import {
  AcademicYearsController,
  SemestersController,
  CoursesController,
  NominalClassesController,
  StudentsController,
  RoomsController,
  ComputersController,
} from './master-data.controllers';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AcademicYearEntity,
      SemesterEntity,
      CourseEntity,
      NominalClassEntity,
      StudentEntity,
      RoomEntity,
      ComputerEntity,
      ClassEntity,
      EnrollmentEntity,
      CourseExamEntity,
      CourseExamQuestionEntity,
      RubricEntity,
      RubricCriterionEntity,
      RubricApproachEntity,
      AccountEntity,
    ]),
  ],
  controllers: [
    AcademicYearsController,
    SemestersController,
    CoursesController,
    NominalClassesController,
    StudentsController,
    RoomsController,
    ComputersController,
  ],
  providers: [MasterDataService, CourseHubService],
})
export class MasterDataModule {}
