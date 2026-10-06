import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { STUDENT_MSSV_REGEX } from '../common/student-mssv';
import { StudentLookupLimiter } from './student-lookup.limiter';
import { StudentService, StudentView } from './student.service';

/**
 * Tra tên theo MSSV, để ô thêm tay hiện tên ngay khi gõ MSSV đã từng nhập ở lớp trước
 * (spec §2.6).
 *
 * CHỈ theo đúng một MSSV, và KHÔNG có route liệt kê: một giảng viên không có cách nào lấy
 * danh sách sinh viên của người khác. Giới hạn tốc độ là bắt buộc — thiếu nó thì quét dải MSSV
 * lấy tên là việc của vài phút.
 *
 * Định dạng sai là 400 và KHÔNG tốn lượt: chúng không chạm DB và không phải cách quét.
 */
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class StudentController {
  constructor(
    private readonly students: StudentService,
    private readonly limiter: StudentLookupLimiter,
  ) {}

  @Get(':mssv')
  async lookup(@Param('mssv') mssv: string, @Req() req: Request): Promise<StudentView> {
    if (!STUDENT_MSSV_REGEX.test(mssv)) {
      throw new BadRequestException('MSSV phải gồm 4-20 chữ cái hoặc chữ số, không có dấu cách');
    }
    this.limiter.enforce(req.user!.sub);
    const found = await this.students.findByMssv(mssv);
    if (!found) throw new NotFoundException('Chưa có sinh viên này trong hệ thống.');
    return found;
  }
}
