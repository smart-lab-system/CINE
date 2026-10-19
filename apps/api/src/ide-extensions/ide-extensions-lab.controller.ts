import { Controller, Get, Param } from '@nestjs/common';
import { IdeExtensionsService } from './ide-extensions.service';

/**
 * Endpoint công khai cho Student Node đăng nhập Quản lý (chỉ MSSV).
 * Không gắn JwtAuthGuard — spec §2.3.
 */
@Controller('ide-extensions/lab')
export class IdeExtensionsLabController {
  constructor(private readonly service: IdeExtensionsService) {}

  @Get('students/by-mssv/:mssv')
  lookupByMssv(@Param('mssv') mssv: string) {
    return this.service.lookupStudentByMssv(mssv);
  }
}
