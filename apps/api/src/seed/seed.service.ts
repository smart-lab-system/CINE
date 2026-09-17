import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AccountsService } from '../accounts/accounts.service';
import { AuditLogService } from '../admin/audit-log.service';
import { CourseService } from '../course/course.service';
import { ClassService } from '../course/class.service';
import { RosterService } from '../course/roster.service';
import { SemesterService } from '../course/semester.service';
import { ClassEntity } from '../course/entities/class.entity';
import { CourseEntity } from '../course/entities/course.entity';
import { SemesterEntity } from '../course/entities/semester.entity';
import { AccountEntity, AccountRole } from '../identity/entities/account.entity';
import { RoomEntity } from '../room/entities/room.entity';
import { RoomService } from '../room/room.service';
import { BootstrapAdminDto } from './dto/bootstrap-admin.dto';
import { EnsureAccountDto } from './dto/ensure-account.dto';
import { EnsureClassDto } from './dto/ensure-class.dto';
import { EnsureCourseDto } from './dto/ensure-course.dto';
import { EnsureRoomDto } from './dto/ensure-room.dto';
import { EnsureRosterDto } from './dto/ensure-roster.dto';
import { EnsureSemesterDto } from './dto/ensure-semester.dto';
import { SeedErrorCode, SeedEnsureResult } from './seed.types';

export type SeedAccountView = SeedEnsureResult<{
  name: string;
  email: string;
  role: AccountRole;
  isActive: boolean;
}>;

export type SeedSemesterView = SeedEnsureResult<{
  name: string;
  startDate: string;
  endDate: string;
}>;

export type SeedRoomView = SeedEnsureResult<{
  name: string;
  capacity: number | null;
}>;

export type SeedCourseView = SeedEnsureResult<{
  code: string;
  name: string;
  semesterId: string;
  departmentHeadId: string | null;
  claimed?: boolean;
}>;

export type SeedClassView = SeedEnsureResult<{
  name: string;
  courseId: string;
  teacherId: string;
}>;

export type SeedRosterView = SeedEnsureResult<{
  classId: string;
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
}>;

@Injectable()
export class SeedService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly semesterService: SemesterService,
    private readonly roomService: RoomService,
    private readonly courseService: CourseService,
    private readonly classService: ClassService,
    private readonly rosterService: RosterService,
    private readonly auditLog: AuditLogService,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(SemesterEntity)
    private readonly semesters: Repository<SemesterEntity>,
    @InjectRepository(RoomEntity)
    private readonly rooms: Repository<RoomEntity>,
    @InjectRepository(CourseEntity)
    private readonly courses: Repository<CourseEntity>,
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
  ) {}

  /**
   * Creates the first admin when `account` is empty (spec §5.3 / §6.1).
   * Public — no JWT. Refuses once any account exists.
   */
  async bootstrapAdmin(
    dto: BootstrapAdminDto,
  ): Promise<{ id: string; email: string; role: 'admin' }> {
    const count = await this.accounts.count();
    if (count > 0) {
      throw new ConflictException({
        code: SeedErrorCode.BOOTSTRAP_NOT_AVAILABLE,
        message: 'Bootstrap is only available when the account table is empty',
      });
    }

    const { id } = await this.accountsService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: 'admin',
    });

    await this.auditLog.recordUserAction({
      actorId: id,
      action: 'seed.bootstrap_admin',
      targetType: 'account',
      targetId: id,
      newValue: { email: dto.email, role: 'admin' },
    });

    return { id, email: dto.email, role: 'admin' };
  }

  /**
   * Ensure account by email (spec §6.2). Password/role change only when
   * the matching update* flag is true.
   */
  async ensureAccount(
    dto: EnsureAccountDto,
    actorId: string,
  ): Promise<SeedAccountView> {
    // DTO IsIn already blocks super_admin on create path; keep an explicit
    // check so a future role-list slip still returns the stable code.
    if ((dto.role as string) === 'super_admin') {
      throw new BadRequestException({
        code: SeedErrorCode.SUPER_ADMIN_NOT_SEEDABLE,
        message: 'super_admin cannot be seeded',
      });
    }

    const existing = await this.accounts.findOne({
      where: { email: dto.email },
    });

    if (!existing) {
      const { id } = await this.accountsService.create({
        name: dto.name,
        email: dto.email,
        password: dto.password,
        role: dto.role,
      });

      await this.auditLog.recordUserAction({
        actorId,
        action: 'seed.ensure_account',
        targetType: 'account',
        targetId: id,
        newValue: { email: dto.email, role: dto.role },
      });

      return {
        id,
        created: true,
        name: dto.name,
        email: dto.email,
        role: dto.role,
        isActive: true,
      };
    }

    if (dto.updatePassword === true) {
      const passwordHash = await argon2.hash(dto.password, {
        type: argon2.argon2id,
      });
      await this.accounts.update(existing.id, { passwordHash });
    }

    if (dto.updateRole === true && dto.role !== existing.role) {
      await this.accountsService.update(existing.id, { role: dto.role });
      existing.role = dto.role;
    }

    return {
      id: existing.id,
      created: false,
      name: existing.name,
      email: existing.email,
      role: existing.role,
      isActive: existing.isActive,
    };
  }

  /** Ensure semester by name (spec §6.3). */
  async ensureSemester(
    dto: EnsureSemesterDto,
    actorId: string,
  ): Promise<SeedSemesterView> {
    const existing = await this.semesters.findOne({
      where: { name: dto.name },
    });

    if (!existing) {
      const created = await this.semesterService.create({
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
      });

      await this.auditLog.recordUserAction({
        actorId,
        action: 'seed.ensure_semester',
        targetType: 'semester',
        targetId: created.id,
        newValue: {
          name: created.name,
          startDate: created.startDate,
          endDate: created.endDate,
        },
      });

      return {
        id: created.id,
        created: true,
        name: created.name,
        startDate: created.startDate,
        endDate: created.endDate,
      };
    }

    if (dto.updateDates === true) {
      const updated = await this.semesterService.update(existing.id, {
        startDate: dto.startDate,
        endDate: dto.endDate,
      });
      return {
        id: updated.id,
        created: false,
        name: updated.name,
        startDate: updated.startDate,
        endDate: updated.endDate,
      };
    }

    return {
      id: existing.id,
      created: false,
      name: existing.name,
      startDate: existing.startDate,
      endDate: existing.endDate,
    };
  }

  /** Ensure room by name (spec §6.4). */
  async ensureRoom(
    dto: EnsureRoomDto,
    actorId: string,
  ): Promise<SeedRoomView> {
    const existing = await this.rooms.findOne({ where: { name: dto.name } });

    if (!existing) {
      const created = await this.roomService.create({
        name: dto.name,
        capacity: dto.capacity,
      });

      await this.auditLog.recordUserAction({
        actorId,
        action: 'seed.ensure_room',
        targetType: 'room',
        targetId: created.id,
        newValue: { name: created.name, capacity: created.capacity },
      });

      return {
        id: created.id,
        created: true,
        name: created.name,
        capacity: created.capacity,
      };
    }

    if (dto.updateCapacity === true && dto.capacity !== undefined) {
      const updated = await this.roomService.update(existing.id, {
        capacity: dto.capacity,
      });
      return {
        id: updated.id,
        created: false,
        name: updated.name,
        capacity: updated.capacity,
      };
    }

    return {
      id: existing.id,
      created: false,
      name: existing.name,
      capacity: existing.capacity,
    };
  }

  /**
   * Ensure course by (semesterName, code); claim unowned migration rows
   * (spec §6.5 / §11.3). Owner is always the resolved head — never admin.
   */
  async ensureCourse(
    dto: EnsureCourseDto,
    actorId: string,
  ): Promise<SeedCourseView> {
    const semester = await this.semesters.findOne({
      where: { name: dto.semesterName },
    });
    if (!semester) {
      throw new NotFoundException({
        code: SeedErrorCode.SEMESTER_NOT_FOUND,
        message: `Semester "${dto.semesterName}" not found`,
      });
    }

    const head = await this.accounts.findOne({
      where: { email: dto.departmentHeadEmail },
    });
    if (!head) {
      throw new NotFoundException({
        code: SeedErrorCode.ACCOUNT_NOT_FOUND,
        message: `Account "${dto.departmentHeadEmail}" not found`,
      });
    }
    if (head.role !== 'department_admin') {
      throw new BadRequestException({
        code: SeedErrorCode.ACCOUNT_ROLE_INVALID,
        message: 'departmentHeadEmail must be a department_admin account',
      });
    }

    const existing = await this.courses.findOne({
      where: { semesterId: semester.id, code: dto.code },
    });

    if (!existing) {
      const created = await this.courseService.createForHead(head.id, {
        code: dto.code,
        name: dto.name,
        semesterId: semester.id,
      });

      await this.auditLog.recordUserAction({
        actorId,
        action: 'seed.ensure_course',
        targetType: 'course',
        targetId: created.id,
        newValue: {
          code: created.code,
          name: created.name,
          semesterId: created.semesterId,
          departmentHeadId: created.departmentHeadId,
        },
      });

      return {
        id: created.id,
        created: true,
        code: created.code,
        name: created.name,
        semesterId: created.semesterId,
        departmentHeadId: created.departmentHeadId,
      };
    }

    if (existing.departmentHeadId === null) {
      const claimed = await this.courseService.assignOwner(
        existing.id,
        head.id,
        actorId,
      );
      return {
        id: claimed.id,
        created: false,
        claimed: true,
        code: claimed.code,
        name: claimed.name,
        semesterId: claimed.semesterId,
        departmentHeadId: claimed.departmentHeadId,
      };
    }

    if (existing.departmentHeadId === head.id) {
      return {
        id: existing.id,
        created: false,
        code: existing.code,
        name: existing.name,
        semesterId: existing.semesterId,
        departmentHeadId: existing.departmentHeadId,
      };
    }

    throw new ConflictException({
      code: SeedErrorCode.COURSE_OWNED_BY_OTHER,
      message: 'Course is owned by a different department head',
    });
  }

  /** Ensure class by (course + name) (spec §6.6). */
  async ensureClass(
    dto: EnsureClassDto,
    actorId: string,
  ): Promise<SeedClassView> {
    const semester = await this.semesters.findOne({
      where: { name: dto.semesterName },
    });
    if (!semester) {
      throw new NotFoundException({
        code: SeedErrorCode.SEMESTER_NOT_FOUND,
        message: `Semester "${dto.semesterName}" not found`,
      });
    }

    const course = await this.courses.findOne({
      where: { semesterId: semester.id, code: dto.courseCode },
    });
    if (!course) {
      throw new NotFoundException({
        code: SeedErrorCode.COURSE_NOT_FOUND,
        message: `Course "${dto.courseCode}" not found in that semester`,
      });
    }
    if (!course.departmentHeadId) {
      throw new BadRequestException({
        code: SeedErrorCode.COURSE_NOT_FOUND,
        message: 'Course has no department head; ensure course first',
      });
    }

    const teacher = await this.accounts.findOne({
      where: { email: dto.teacherEmail },
    });
    if (!teacher) {
      throw new NotFoundException({
        code: SeedErrorCode.ACCOUNT_NOT_FOUND,
        message: `Account "${dto.teacherEmail}" not found`,
      });
    }
    if (teacher.role !== 'teacher') {
      throw new BadRequestException({
        code: SeedErrorCode.ACCOUNT_ROLE_INVALID,
        message: 'teacherEmail must be a teacher account',
      });
    }

    const existing = await this.classes.findOne({
      where: { courseId: course.id, name: dto.name },
    });

    if (!existing) {
      const created = await this.classService.createForHead(
        course.departmentHeadId,
        {
          courseId: course.id,
          name: dto.name,
          teacherId: teacher.id,
        },
      );

      await this.auditLog.recordUserAction({
        actorId,
        action: 'seed.ensure_class',
        targetType: 'class',
        targetId: created.id,
        newValue: {
          name: created.name,
          courseId: created.courseId,
          teacherId: created.teacherId,
        },
      });

      return {
        id: created.id,
        created: true,
        name: created.name,
        courseId: created.courseId,
        teacherId: created.teacherId,
      };
    }

    if (existing.teacherId === teacher.id) {
      return {
        id: existing.id,
        created: false,
        name: existing.name,
        courseId: existing.courseId,
        teacherId: existing.teacherId,
      };
    }

    if (dto.reassignTeacher !== true) {
      throw new ConflictException({
        code: SeedErrorCode.CLASS_TEACHER_MISMATCH,
        message: 'Class exists with a different teacher',
      });
    }

    const updated = await this.classService.updateForHead(
      existing.id,
      course.departmentHeadId,
      { teacherId: teacher.id },
    );

    return {
      id: updated.id,
      created: false,
      name: updated.name,
      courseId: updated.courseId,
      teacherId: updated.teacherId,
    };
  }

  /**
   * Ensure roster via RosterService.importForClass (spec §6.7). Admin path —
   * does not go through findTaughtBy.
   */
  async ensureRoster(
    dto: EnsureRosterDto,
    actorId: string,
  ): Promise<SeedRosterView> {
    const semester = await this.semesters.findOne({
      where: { name: dto.semesterName },
    });
    if (!semester) {
      throw new NotFoundException({
        code: SeedErrorCode.SEMESTER_NOT_FOUND,
        message: `Semester "${dto.semesterName}" not found`,
      });
    }

    const course = await this.courses.findOne({
      where: { semesterId: semester.id, code: dto.courseCode },
    });
    if (!course) {
      throw new NotFoundException({
        code: SeedErrorCode.COURSE_NOT_FOUND,
        message: `Course "${dto.courseCode}" not found in that semester`,
      });
    }

    const klass = await this.classes.findOne({
      where: { courseId: course.id, name: dto.className },
    });
    if (!klass) {
      throw new NotFoundException({
        code: SeedErrorCode.CLASS_NOT_FOUND,
        message: `Class "${dto.className}" not found for that course`,
      });
    }

    const result = await this.rosterService.importForClass(klass, {
      students: dto.students,
      removeMissing: dto.removeMissing ?? false,
    });

    const changed =
      result.added > 0 || result.updated > 0 || result.removed > 0;
    if (changed) {
      await this.auditLog.recordUserAction({
        actorId,
        action: 'seed.ensure_roster',
        targetType: 'class',
        targetId: klass.id,
        newValue: {
          added: result.added,
          updated: result.updated,
          unchanged: result.unchanged,
          removed: result.removed,
        },
      });
    }

    return {
      id: klass.id,
      classId: klass.id,
      created: result.added > 0,
      added: result.added,
      updated: result.updated,
      unchanged: result.unchanged,
      removed: result.removed,
    };
  }
}
