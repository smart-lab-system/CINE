import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IdeExtensionsService } from './ide-extensions.service';
import { VerifyTeacherMachineDto } from './dto/ide-extensions.dto';

/**
 * Endpoint công khai cho Student Node đăng nhập Quản lý (chỉ MSSV)
 * và resolve vai trò máy trước login.
 * Không gắn JwtAuthGuard — spec §2.3 / 2026-11-18.
 */
@Controller('ide-extensions/lab')
export class IdeExtensionsLabController {
  constructor(private readonly service: IdeExtensionsService) {}

  @Get('students/by-mssv/:mssv')
  lookupByMssv(@Param('mssv') mssv: string) {
    return this.service.lookupStudentByMssv(mssv);
  }

  /** Agent: máy này vào luồng GV hay SV khi mở Quản lý. */
  @Post('resolve-machine-role')
  resolveMachineRole(@Body() dto: VerifyTeacherMachineDto) {
    return this.service.resolveMachineRole(dto);
  }
}
