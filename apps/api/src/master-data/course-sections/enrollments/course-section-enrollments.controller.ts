import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CourseSectionEnrollmentsService } from './course-section-enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { SearchEnrollmentsDto } from './dto/search-enrollments.dto';
import { PaginatedEnrollmentsDto } from './dto/enrollment-list-item.dto';

@ApiTags('course-sections')
@Controller('course-sections/:sectionId/enrollments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CourseSectionEnrollmentsController {
  constructor(private readonly enrollments: CourseSectionEnrollmentsService) {}

  @Post()
  enroll(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateEnrollmentDto,
  ): Promise<{ id: string }> {
    return this.enrollments.enroll(sectionId, dto.studentId);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedEnrollmentsDto })
  list(
    @Param('sectionId') sectionId: string,
    @Query() query: SearchEnrollmentsDto,
  ): Promise<PaginatedEnrollmentsDto> {
    return this.enrollments.list(sectionId, query);
  }

  @Delete(':studentId')
  @HttpCode(204)
  async unenroll(
    @Param('sectionId') sectionId: string,
    @Param('studentId') studentId: string,
  ): Promise<void> {
    await this.enrollments.unenroll(sectionId, studentId);
  }
}
