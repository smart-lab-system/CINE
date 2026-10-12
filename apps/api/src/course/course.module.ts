import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { ClassService } from './class.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { EnrollmentService } from './enrollment.service';
import { RosterService } from './roster.service';
import { ClassController } from './class.controller';
import { AdminCourseSectionController } from './admin-course-section.controller';
import { AdminCourseSectionService } from './admin-course-section.service';
import { CourseEntity } from '../master-data/entities/course.entity';
import { SemesterEntity } from '../master-data/entities/semester.entity';
import { StudentEntity } from '../master-data/entities/student.entity';

/**
 * Lớp học phần + enrollment.
 *
 * Admin tạo lớp (môn + kỳ catalog), gắn roster, phân công GV.
 * Teacher chỉ đọc lớp đã được gán (`/classes/teaching`) và sửa roster.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassEntity,
      EnrollmentEntity,
      AccountEntity,
      CourseEntity,
      SemesterEntity,
      StudentEntity,
    ]),
  ],
  controllers: [ClassController, AdminCourseSectionController],
  providers: [
    ClassService,
    EnrollmentService,
    RosterService,
    AdminCourseSectionService,
  ],
  exports: [ClassService, EnrollmentService],
})
export class CourseModule {}
