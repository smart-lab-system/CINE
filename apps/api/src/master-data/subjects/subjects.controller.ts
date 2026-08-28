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
import { PaginationQueryDto } from '../dto/common/pagination-query.dto';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import {
  CreateSubjectResponseDto,
  SubjectViewDto,
  SubjectsListResponseDto,
} from './dto/subject-response.dto';

@ApiTags('subjects')
@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Post()
  @ApiOkResponse({ type: CreateSubjectResponseDto })
  create(@Body() dto: CreateSubjectDto) {
    return this.subjects.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: SubjectsListResponseDto })
  search(@Query() query: PaginationQueryDto) {
    return this.subjects.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: SubjectViewDto })
  findOne(@Param('id') id: string) {
    return this.subjects.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SubjectViewDto })
  update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjects.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.subjects.remove(id);
  }
}
