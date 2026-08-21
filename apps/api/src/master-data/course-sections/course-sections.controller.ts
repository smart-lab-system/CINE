import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CourseSectionsService } from './course-sections.service';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import { SearchCourseSectionsDto } from './dto/search-course-sections.dto';
import {
  CourseSectionListItemDto,
  PaginatedCourseSectionsDto,
} from './dto/course-section-list-item.dto';

@ApiTags('course-sections')
@Controller('course-sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CourseSectionsController {
  constructor(private readonly sections: CourseSectionsService) {}

  @Post()
  create(@Body() dto: CreateCourseSectionDto): Promise<{ id: string }> {
    return this.sections.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedCourseSectionsDto })
  search(@Query() query: SearchCourseSectionsDto): Promise<PaginatedCourseSectionsDto> {
    return this.sections.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CourseSectionListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseSectionDto,
  ): Promise<CourseSectionListItemDto> {
    return this.sections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.sections.remove(id);
  }
}
