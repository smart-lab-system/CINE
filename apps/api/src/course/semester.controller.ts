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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SemesterService } from './semester.service';
import { CreateSemesterDto, UpdateSemesterDto } from './dto/course.dto';

/**
 * Read is open (the course form needs the list); write is Trưởng khoa.
 * No ownership check — terms are university-wide, so there is nobody to
 * own one.
 */
@Controller('semesters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SemesterController {
  constructor(private readonly semesters: SemesterService) {}

  @Get()
  findAll() {
    return this.semesters.findAll();
  }

  @Post()
  @Roles('department_admin')
  create(@Body() dto: CreateSemesterDto) {
    return this.semesters.create(dto);
  }

  @Patch(':id')
  @Roles('department_admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSemesterDto) {
    return this.semesters.update(id, dto);
  }

  @Delete(':id')
  @Roles('department_admin')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.semesters.remove(id);
  }
}
