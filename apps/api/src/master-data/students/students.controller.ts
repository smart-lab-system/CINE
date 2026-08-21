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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { SearchStudentsDto } from './dto/search-students.dto';
import { PaginatedStudentsDto, StudentListItemDto } from './dto/student-list-item.dto';

@ApiTags('students')
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  create(@Body() dto: CreateStudentDto): Promise<{ id: string }> {
    return this.students.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedStudentsDto })
  search(@Query() query: SearchStudentsDto): Promise<PaginatedStudentsDto> {
    return this.students.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StudentListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentListItemDto> {
    return this.students.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.students.remove(id);
  }
}
