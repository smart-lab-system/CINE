import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AcademicYearEntity } from './entities/academic-year.entity';
import { SemesterEntity } from './entities/semester.entity';
import { CourseEntity } from './entities/course.entity';
import { NominalClassEntity } from './entities/nominal-class.entity';
import { StudentEntity } from './entities/student.entity';
import { RoomEntity } from './entities/room.entity';
import { ComputerEntity } from './entities/computer.entity';
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

@Injectable()
export class MasterDataService {
  constructor(
    @InjectRepository(AcademicYearEntity)
    private readonly academicYears: Repository<AcademicYearEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesters: Repository<SemesterEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(NominalClassEntity)
    private readonly nominalClasses: Repository<NominalClassEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    @InjectRepository(RoomEntity)
    private readonly rooms: Repository<RoomEntity>,
    @InjectRepository(ComputerEntity)
    private readonly computers: Repository<ComputerEntity>,
  ) {}

  // --- academic year ---

  async createAcademicYear(dto: CreateAcademicYearDto) {
    const saved = await this.academicYears.save(this.academicYears.create(dto));
    return { id: saved.id };
  }

  async listAcademicYears(query: ListAcademicYearsDto) {
    const qb = this.academicYears.createQueryBuilder('y');
    if (query.status) qb.andWhere('y.status = :status', { status: query.status });
    qb.orderBy('y.start_date', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getAcademicYear(id: string) {
    const row = await this.academicYears.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Academic year not found');
    return row;
  }

  async updateAcademicYear(id: string, dto: UpdateAcademicYearDto) {
    const row = await this.getAcademicYear(id);
    Object.assign(row, dto);
    return this.academicYears.save(row);
  }

  async removeAcademicYear(id: string) {
    const row = await this.getAcademicYear(id);
    await this.academicYears.remove(row);
  }

  // --- semester ---

  async createSemester(dto: CreateSemesterDto) {
    await this.getAcademicYear(dto.academicYearId);
    const saved = await this.semesters.save(this.semesters.create(dto));
    return { id: saved.id };
  }

  async listSemesters(query: ListSemestersDto) {
    const qb = this.semesters.createQueryBuilder('s');
    if (query.academicYearId) {
      qb.andWhere('s.academic_year_id = :academicYearId', {
        academicYearId: query.academicYearId,
      });
    }
    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    qb.orderBy('s.start_date', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getSemester(id: string) {
    const row = await this.semesters.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Semester not found');
    return row;
  }

  async updateSemester(id: string, dto: UpdateSemesterDto) {
    const row = await this.getSemester(id);
    if (dto.academicYearId) await this.getAcademicYear(dto.academicYearId);
    Object.assign(row, dto);
    return this.semesters.save(row);
  }

  async removeSemester(id: string) {
    const row = await this.getSemester(id);
    await this.semesters.remove(row);
  }

  // --- course ---

  async createCourse(dto: CreateCourseDto) {
    const saved = await this.courses.save(this.courses.create(dto));
    return { id: saved.id };
  }

  async listCourses(query: ListCoursesDto) {
    const qb = this.courses.createQueryBuilder('c');
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(c.code ILIKE :term OR c.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    qb.orderBy('c.code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getCourse(id: string) {
    const row = await this.courses.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Course not found');
    return row;
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    const row = await this.getCourse(id);
    Object.assign(row, dto);
    return this.courses.save(row);
  }

  async removeCourse(id: string) {
    const row = await this.getCourse(id);
    await this.courses.remove(row);
  }

  // --- nominal class ---

  async createNominalClass(dto: CreateNominalClassDto) {
    const saved = await this.nominalClasses.save(
      this.nominalClasses.create({
        code: dto.code,
        name: dto.name ?? null,
        cohortYear: dto.cohortYear ?? null,
        status: dto.status,
      }),
    );
    return { id: saved.id };
  }

  async listNominalClasses(query: ListNominalClassesDto) {
    const qb = this.nominalClasses.createQueryBuilder('n');
    if (query.status) qb.andWhere('n.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(n.code ILIKE :term OR n.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    qb.orderBy('n.code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getNominalClass(id: string) {
    const row = await this.nominalClasses.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Nominal class not found');
    return row;
  }

  async updateNominalClass(id: string, dto: UpdateNominalClassDto) {
    const row = await this.getNominalClass(id);
    if (dto.code !== undefined) row.code = dto.code;
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.cohortYear !== undefined) row.cohortYear = dto.cohortYear;
    if (dto.status !== undefined) row.status = dto.status;
    return this.nominalClasses.save(row);
  }

  async removeNominalClass(id: string) {
    const row = await this.getNominalClass(id);
    await this.nominalClasses.remove(row);
  }

  // --- student ---

  async createStudent(dto: CreateStudentDto) {
    await this.getNominalClass(dto.nominalClassId);
    const saved = await this.students.save(this.students.create(dto));
    return { id: saved.id };
  }

  async listStudents(query: ListStudentsDto) {
    const qb = this.students.createQueryBuilder('s');
    if (query.nominalClassId) {
      qb.andWhere('s.nominal_class_id = :nominalClassId', {
        nominalClassId: query.nominalClassId,
      });
    }
    if (query.status) qb.andWhere('s.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(s.mssv ILIKE :term OR s.full_name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    qb.orderBy('s.mssv', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getStudent(id: string) {
    const row = await this.students.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Student not found');
    return row;
  }

  async updateStudent(id: string, dto: UpdateStudentDto) {
    const row = await this.getStudent(id);
    if (dto.nominalClassId) await this.getNominalClass(dto.nominalClassId);
    Object.assign(row, dto);
    return this.students.save(row);
  }

  async removeStudent(id: string) {
    const row = await this.getStudent(id);
    await this.students.remove(row);
  }

  // --- room ---

  async createRoom(dto: CreateRoomDto) {
    const saved = await this.rooms.save(
      this.rooms.create({
        code: dto.code,
        name: dto.name,
        capacity: dto.capacity,
        building: dto.building ?? null,
        status: dto.status,
      }),
    );
    return { id: saved.id };
  }

  async listRooms(query: ListRoomsDto) {
    const qb = this.rooms.createQueryBuilder('r');
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(r.code ILIKE :term OR r.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    qb.orderBy('r.code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getRoom(id: string) {
    const row = await this.rooms.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Room not found');
    return row;
  }

  async updateRoom(id: string, dto: UpdateRoomDto) {
    const row = await this.getRoom(id);
    if (dto.code !== undefined) row.code = dto.code;
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.capacity !== undefined) row.capacity = dto.capacity;
    if (dto.building !== undefined) row.building = dto.building;
    if (dto.status !== undefined) row.status = dto.status;
    return this.rooms.save(row);
  }

  async removeRoom(id: string) {
    const row = await this.getRoom(id);
    await this.rooms.remove(row);
  }

  // --- computer ---

  async createComputer(dto: CreateComputerDto) {
    await this.getRoom(dto.roomId);
    const saved = await this.computers.save(
      this.computers.create({
        roomId: dto.roomId,
        hostname: dto.hostname,
        cpu: dto.cpu,
        ramGb: dto.ramGb,
        storage: dto.storage,
        gpu: dto.gpu ?? null,
        os: dto.os,
        ipAddress: dto.ipAddress ?? null,
        macAddress: dto.macAddress ?? null,
        status: dto.status,
      }),
    );
    return { id: saved.id };
  }

  async listComputers(query: ListComputersDto) {
    const qb = this.computers.createQueryBuilder('c');
    if (query.roomId) qb.andWhere('c.room_id = :roomId', { roomId: query.roomId });
    if (query.status) qb.andWhere('c.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere('(c.hostname ILIKE :term OR c.cpu ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    qb.orderBy('c.hostname', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getComputer(id: string) {
    const row = await this.computers.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Computer not found');
    return row;
  }

  async updateComputer(id: string, dto: UpdateComputerDto) {
    const row = await this.getComputer(id);
    if (dto.roomId) await this.getRoom(dto.roomId);
    Object.assign(row, dto);
    return this.computers.save(row);
  }

  async removeComputer(id: string) {
    const row = await this.getComputer(id);
    await this.computers.remove(row);
  }
}
