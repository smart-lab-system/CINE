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
import { MasterDataService } from './master-data.service';
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
  providers: [MasterDataService],
})
export class MasterDataModule {}
