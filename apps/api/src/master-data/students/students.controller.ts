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
import {
  CreateStudentResponseDto,
  StudentViewDto,
  StudentsListResponseDto,
} from './dto/student-response.dto';

@ApiTags('students')
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  @ApiOkResponse({ type: CreateStudentResponseDto })
  create(@Body() dto: CreateStudentDto) {
    return this.students.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: StudentsListResponseDto })
  search(@Query() query: SearchStudentsDto) {
    return this.students.search(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: StudentViewDto })
  findOne(@Param('id') id: string) {
    return this.students.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StudentViewDto })
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.students.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.students.remove(id);
  }
}
