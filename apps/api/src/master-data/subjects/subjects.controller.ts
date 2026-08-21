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
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SearchSubjectsDto } from './dto/search-subjects.dto';
import { PaginatedSubjectsDto, SubjectListItemDto } from './dto/subject-list-item.dto';

@ApiTags('subjects')
@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Post()
  create(@Body() dto: CreateSubjectDto): Promise<{ id: string }> {
    return this.subjects.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedSubjectsDto })
  search(@Query() query: SearchSubjectsDto): Promise<PaginatedSubjectsDto> {
    return this.subjects.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SubjectListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
  ): Promise<SubjectListItemDto> {
    return this.subjects.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.subjects.remove(id);
  }
}
