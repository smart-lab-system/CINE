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
import { LecturersService } from './lecturers.service';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import {
  CreateLecturerResponseDto,
  LecturerViewDto,
  LecturersListResponseDto,
} from './dto/lecturer-response.dto';

@ApiTags('lecturers')
@Controller('lecturers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LecturersController {
  constructor(private readonly lecturers: LecturersService) {}

  @Post()
  @ApiOkResponse({ type: CreateLecturerResponseDto })
  create(@Body() dto: CreateLecturerDto) {
    return this.lecturers.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: LecturersListResponseDto })
  search(@Query() query: PaginationQueryDto) {
    return this.lecturers.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: LecturerViewDto })
  findOne(@Param('id') id: string) {
    return this.lecturers.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: LecturerViewDto })
  update(@Param('id') id: string, @Body() dto: UpdateLecturerDto) {
    return this.lecturers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.lecturers.remove(id);
  }
}
