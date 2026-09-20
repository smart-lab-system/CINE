import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { ClassService } from './class.service';
import { AccountEntity } from '../identity/entities/account.entity';
import { EnrollmentService } from './enrollment.service';
import { RosterService } from './roster.service';
import { ClassController } from './class.controller';

/**
 * Lớp và danh sách sinh viên — phần còn lại của "cấu trúc học vụ" sau đợt
 * thu hẹp master data.
 *
 * Module này từng sở hữu cả `Course` và `Semester`, cùng controller cho
 * trưởng khoa quản chúng. Hệ thống thôi quản lý dữ liệu nền của trường: nó
 * chỉ ghi lại những gì giảng viên khai cho một phiên thi, nên môn học là
 * một chuỗi trên `class`/`exam_session` chứ không còn là một hàng.
 *
 * `EnrollmentService` được export vì `SessionRosterService` phải trả lời
 * "em này thuộc lớp nào" lúc chốt danh sách dự thi, và câu hỏi đó thuộc dữ
 * liệu của module này, không thuộc một bộ repository thứ hai trên cùng bảng.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ClassEntity, EnrollmentEntity, AccountEntity]),
  ],
  controllers: [ClassController],
  providers: [ClassService, EnrollmentService, RosterService],
  // ClassService is exported for ExamSessionService: creating a session
  // needs the lecturer's own scope on a class, and that scope is decided in
  // one place rather than re-derived against a second set of repositories.
  exports: [ClassService, EnrollmentService],
})
export class CourseModule {}
