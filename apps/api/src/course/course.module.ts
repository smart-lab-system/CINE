import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { SemesterEntity } from './entities/semester.entity';
import { RoomEntity } from './entities/room.entity';
import { AdministrativeClassEntity } from './entities/administrative-class.entity';
import { StudentEntity } from './entities/student.entity';
import { ClassService } from './class.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { EnrollmentService } from './enrollment.service';
import { RosterService } from './roster.service';
import { ClassController } from './class.controller';
import { AdminModule } from '../admin/admin.module';
import { SemesterService } from './semester.service';
import { SemesterController } from './semester.controller';
import { RoomService } from './room.service';
import { RoomController } from './room.controller';
import { AdministrativeClassService } from './administrative-class.service';
import { AdministrativeClassController } from './administrative-class.controller';
import { ClassLabelService } from './class-label.service';
import { StudentService } from './student.service';
import { StudentController } from './student.controller';
import { StudentLookupLimiter } from './student-lookup.limiter';

/**
 * Dữ liệu nền có phân tầng: HỌC KỲ, PHÒNG THI, LỚP DANH NGHĨA, SINH VIÊN, LỚP và
 * DANH SÁCH SINH VIÊN của lớp. Admin khai (học kỳ, phòng, lớp danh nghĩa, lớp);
 * giảng viên chỉ chọn và chỉ nhập danh sách sinh viên của lớp mình được giao.
 *
 * Môn học vẫn là một chuỗi hằng số (`COURSE_NAME`) trên `class`/`exam_session`,
 * không phải một hàng — hệ thống phục vụ đúng một môn.
 *
 * `EnrollmentService` được export vì `SessionRosterService` phải trả lời
 * "em này thuộc lớp nào" lúc chốt danh sách dự thi, và câu hỏi đó thuộc dữ
 * liệu của module này, không thuộc một bộ repository thứ hai trên cùng bảng.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassEntity,
      EnrollmentEntity,
      SemesterEntity,
      RoomEntity,
      AdministrativeClassEntity,
      StudentEntity,
      AccountEntity,
    ]),
    AdminModule,
  ],
  controllers: [
    ClassController,
    SemesterController,
    RoomController,
    AdministrativeClassController,
    StudentController,
  ],
  providers: [
    ClassService,
    EnrollmentService,
    RosterService,
    SemesterService,
    RoomService,
    AdministrativeClassService,
    ClassLabelService,
    StudentService,
    StudentLookupLimiter,
  ],
  // ClassService is exported for ExamSessionService: creating a session
  // needs the lecturer's own scope on a class, and that scope is decided in
  // one place rather than re-derived against a second set of repositories.
  exports: [
    ClassService,
    EnrollmentService,
    SemesterService,
    RoomService,
    AdministrativeClassService,
    ClassLabelService,
    StudentService,
    // Bộ đếm tra tên là MỘT: đường thêm tay vào phiên (ExamSessionController) dùng chung với course.
    StudentLookupLimiter,
  ],
})
export class CourseModule {}
