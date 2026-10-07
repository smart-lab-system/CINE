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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MasterDataService } from './master-data.service';
import {
  CreateAcademicYearDto,
  ListAcademicYearsDto,
  UpdateAcademicYearDto,
} from './dto/academic-year.dto';
import {
  CreateSemesterDto,
  ListSemestersDto,
  UpdateSemesterDto,
} from './dto/semester.dto';
import { CreateCourseDto, ListCoursesDto, UpdateCourseDto } from './dto/course.dto';
import {
  CreateNominalClassDto,
  ListNominalClassesDto,
  UpdateNominalClassDto,
} from './dto/nominal-class.dto';
import {
  CreateStudentDto,
  ListStudentsDto,
  UpdateStudentDto,
} from './dto/student.dto';
import { CreateRoomDto, ListRoomsDto, UpdateRoomDto } from './dto/room.dto';
import {
  CreateComputerDto,
  ListComputersDto,
  UpdateComputerDto,
} from './dto/computer.dto';

@Controller('master-data/academic-years')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AcademicYearsController {
  constructor(private readonly masterData: MasterDataService) {}

  @Post()
  create(@Body() dto: CreateAcademicYearDto) {
    return this.masterData.createAcademicYear(dto);
  }

  @Get()
  list(@Query() query: ListAcademicYearsDto) {
    return this.masterData.listAcademicYears(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.masterData.getAcademicYear(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAcademicYearDto) {
    return this.masterData.updateAcademicYear(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.masterData.removeAcademicYear(id);
  }
}

@Controller('master-data/semesters')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SemestersController {
  constructor(private readonly masterData: MasterDataService) {}

  @Post()
  create(@Body() dto: CreateSemesterDto) {
    return this.masterData.createSemester(dto);
  }

  @Get()
  list(@Query() query: ListSemestersDto) {
    return this.masterData.listSemesters(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.masterData.getSemester(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSemesterDto) {
    return this.masterData.updateSemester(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.masterData.removeSemester(id);
  }
}

@Controller('master-data/courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CoursesController {
  constructor(private readonly masterData: MasterDataService) {}

  @Post()
  create(@Body() dto: CreateCourseDto) {
    return this.masterData.createCourse(dto);
  }

  @Get()
  list(@Query() query: ListCoursesDto) {
    return this.masterData.listCourses(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.masterData.getCourse(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.masterData.updateCourse(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.masterData.removeCourse(id);
  }
}

@Controller('master-data/nominal-classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NominalClassesController {
  constructor(private readonly masterData: MasterDataService) {}

  @Post()
  create(@Body() dto: CreateNominalClassDto) {
    return this.masterData.createNominalClass(dto);
  }

  @Get()
  list(@Query() query: ListNominalClassesDto) {
    return this.masterData.listNominalClasses(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.masterData.getNominalClass(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateNominalClassDto) {
    return this.masterData.updateNominalClass(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.masterData.removeNominalClass(id);
  }
}

@Controller('master-data/students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StudentsController {
  constructor(private readonly masterData: MasterDataService) {}

  @Post()
  create(@Body() dto: CreateStudentDto) {
    return this.masterData.createStudent(dto);
  }

  @Get()
  list(@Query() query: ListStudentsDto) {
    return this.masterData.listStudents(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.masterData.getStudent(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateStudentDto) {
    return this.masterData.updateStudent(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.masterData.removeStudent(id);
  }
}

@Controller('master-data/rooms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class RoomsController {
  constructor(private readonly masterData: MasterDataService) {}

  @Post()
  create(@Body() dto: CreateRoomDto) {
    return this.masterData.createRoom(dto);
  }

  @Get()
  list(@Query() query: ListRoomsDto) {
    return this.masterData.listRooms(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.masterData.getRoom(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRoomDto) {
    return this.masterData.updateRoom(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.masterData.removeRoom(id);
  }
}

@Controller('master-data/computers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ComputersController {
  constructor(private readonly masterData: MasterDataService) {}

  @Post()
  create(@Body() dto: CreateComputerDto) {
    return this.masterData.createComputer(dto);
  }

  @Get()
  list(@Query() query: ListComputersDto) {
    return this.masterData.listComputers(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.masterData.getComputer(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateComputerDto) {
    return this.masterData.updateComputer(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.masterData.removeComputer(id);
  }
}
