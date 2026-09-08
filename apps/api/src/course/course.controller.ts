import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CourseService } from './course.service';
import {
  AssignCourseOwnerDto,
  CreateCourseDto,
  UpdateCourseDto,
} from './dto/course.dto';
import { SemesterScopeDto } from './dto/semester-scope.dto';
import { CourseCatalogQueryDto } from './dto/course-catalog.dto';

/**
 * Read is open to any authenticated account — the create-exam-session form
 * needs the list. Write belongs to the Trưởng khoa who owns the course, and
 * ownership is enforced in the service (404 then 403), matching how
 * ExamSessionService.findByIdForOwner already reads.
 *
 * `/mine` and `/unowned` are declared before `:id` routes so a literal path
 * segment can never be swallowed as a uuid param.
 */
@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  /**
   * Danh mục môn cấp trường. Chỉ Phòng Đào tạo — trước đây handler này KHÔNG
   * có `@Roles` nào, tức mọi user đăng nhập đọc được mọi môn toàn trường, và
   * không màn hình nào ở web dùng nó.
   *
   * KHÁC `GET /courses/mine`: cái đó là danh sách môn CỦA MỘT KHOA, dành cho
   * Trưởng khoa, scope bằng `department_head_id`. Hai endpoint độc lập, tên
   * gần giống nhau, không giao nhau — đừng gộp.
   */
  @Get()
  @Roles('academic_affairs')
  findCatalog(@Query() query: CourseCatalogQueryDto) {
    return this.courses.findCatalog({
      semesterId: query.semesterId,
      unowned: query.unowned === 'true',
    });
  }

  @Get('mine')
  @Roles('department_admin')
  findMine(@Query() query: SemesterScopeDto, @Req() req: Request) {
    return this.courses.findForHead(req.user!.sub, query.semesterId);
  }

  @Post()
  @Roles('department_admin')
  create(@Body() dto: CreateCourseDto, @Req() req: Request) {
    return this.courses.createForHead(req.user!.sub, dto);
  }

  @Patch(':id')
  @Roles('department_admin')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
    @Req() req: Request,
  ) {
    return this.courses.updateForHead(id, req.user!.sub, dto);
  }

  @Delete(':id')
  @Roles('department_admin')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.courses.removeForHead(id, req.user!.sub);
  }

  @Patch(':id/owner')
  @Roles('academic_affairs')
  assignOwner(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignCourseOwnerDto,
    @Req() req: Request,
  ) {
    return this.courses.assignOwner(id, dto.departmentHeadId, req.user!.sub);
  }
}
