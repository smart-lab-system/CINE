import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { COURSE_NAME } from '../common/course-name';
import { ClassService } from './class.service';
import {
  ImportAdministrativeClassesDto,
  ImportClassesDto,
  ImportRoomsDto,
  ImportSemestersDto,
} from './dto/import.dto';
import { AdministrativeClassEntity } from './entities/administrative-class.entity';
import { ClassEntity } from './entities/class.entity';
import { RoomEntity } from './entities/room.entity';
import { SemesterEntity } from './entities/semester.entity';
import { runImport } from './import/import-runner';
import type { ImportResult } from './import/import.types';
import { reassignedAuditExtra } from './import/reassigned-audit';
import {
  planAdministrativeClassImport,
  type AdministrativeClassWrite,
  type ExistingAdministrativeClass,
} from './import/plan-administrative-class-import';
import {
  planClassImport,
  type ClassImportContext,
  type ClassImportRow,
  type ClassWrite,
} from './import/plan-class-import';
import { planRoomImport, type ExistingRoom, type RoomWrite } from './import/plan-room-import';
import {
  planSemesterImport,
  type ExistingSemester,
  type SemesterWrite,
} from './import/plan-semester-import';

/**
 * Import dữ liệu nền của admin (spec §6). Service chỉ làm hai việc mà planner không được làm: NẠP trạng thái hiện có và GHI.
 * Mọi quyết định (dòng nào mới, sửa, lỗi, gần giống) nằm ở planner thuần; mọi thủ tục (khoá, từ chối, audit) ở `runImport`.
 *
 * Ghi đi thẳng qua repository thay vì gọi `SemesterService.create`… vì các hàm đó mỗi lần ghi một dòng audit riêng, còn một
 * lần import phải để lại ĐÚNG MỘT dòng cho cả lô. Luật kiểm hợp lệ thì vẫn chung: planner gọi `semesterProblems`,
 * `roomNameProblem`, `administrativeCodeProblem` — chính các hàm mà nhập tay dùng (nguyên tắc 6).
 */
@Injectable()
export class MasterDataImportService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
    private readonly classes: ClassService,
  ) {}

  importSemesters(actorId: string, dto: ImportSemestersDto): Promise<ImportResult> {
    return runImport<SemesterWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:semester',
      audit: { action: 'semester.import', targetType: 'semester', targetLabel: 'Học kỳ (nhập từ file)' },
      plan: async (manager) => planSemesterImport(dto.rows, await this.loadSemesters(manager)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(SemesterEntity);
        for (const write of writes) {
          if (write.kind === 'create') {
            await repo.save(
              repo.create({
                academicYearStart: write.academicYearStart,
                term: write.term,
                startDate: write.startDate,
                endDate: write.endDate,
              }),
            );
          } else {
            await repo.update({ id: write.id }, { startDate: write.startDate, endDate: write.endDate });
          }
        }
      },
    });
  }

  importRooms(actorId: string, dto: ImportRoomsDto): Promise<ImportResult> {
    return runImport<RoomWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:room',
      audit: { action: 'room.import', targetType: 'room', targetLabel: 'Phòng thi (nhập từ file)' },
      plan: async (manager) => planRoomImport(dto.rows, await this.loadRooms(manager)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(RoomEntity);
        for (const write of writes) {
          if (write.kind === 'create') {
            await repo.save(repo.create({ name: write.name, capacity: write.capacity, isActive: true }));
          } else {
            await repo.update({ id: write.id }, { capacity: write.capacity });
          }
        }
      },
    });
  }

  importAdministrativeClasses(actorId: string, dto: ImportAdministrativeClassesDto): Promise<ImportResult> {
    return runImport<AdministrativeClassWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:administrative_class',
      audit: {
        action: 'administrative_class.import',
        targetType: 'administrative_class',
        targetLabel: 'Danh mục lớp danh nghĩa (nhập từ file)',
      },
      plan: async (manager) => planAdministrativeClassImport(dto.rows, await this.loadAdministrativeClasses(manager)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(AdministrativeClassEntity);
        for (const write of writes) {
          await repo.save(repo.create({ code: write.code }));
        }
      },
    });
  }

  importClasses(actorId: string, dto: ImportClassesDto): Promise<ImportResult> {
    return runImport<ClassWrite>({
      dataSource: this.dataSource,
      auditLog: this.auditLog,
      actorId,
      dryRun: dto.dryRun,
      confirmSimilar: dto.confirmSimilar === true,
      lockName: 'import:class',
      audit: { action: 'class.import', targetType: 'class', targetLabel: 'Lớp (nhập từ file)' },
      plan: async (manager) => planClassImport(dto.rows, await this.loadClassContext(manager, dto.rows)),
      apply: async (manager, writes) => {
        const repo = manager.getRepository(ClassEntity);
        for (const write of writes) {
          if (write.kind === 'create') {
            await repo.save(
              repo.create({
                courseName: COURSE_NAME,
                semesterId: write.semesterId,
                administrativeClassId: write.administrativeClassId,
                groupName: write.groupName,
                teacherId: write.teacherId,
              }),
            );
          } else {
            // CÙNG hàm với nhập tay: enrollment đi theo, phiên/ảnh chốt/bài nộp đã có giữ giảng viên cũ.
            await this.classes.applyTeacherChange(manager, write.classId, write.toTeacherId);
          }
        }
      },
      // Đổi giảng viên là thứ duy nhất trong lô có hệ quả về QUYỀN, nên audit nêu rõ ai bị đổi (cắt theo BYTE để cả dòng còn dưới trần
      // 4 KB của trang audit; tổng số luôn có) — xem `reassignedAuditExtra`.
      auditExtra: (plan) =>
        reassignedAuditExtra(
          plan.writes
            .filter((w): w is Extract<ClassWrite, { kind: 'reassign' }> => w.kind === 'reassign')
            .map((w) => ({ label: w.label, from: w.fromTeacherName, to: w.toTeacherName })),
        ),
    });
  }

  // ----------------------------------------------------------------- nạp trạng thái hiện có

  private async loadClassContext(manager: EntityManager, rows: readonly ClassImportRow[]): Promise<ClassImportContext> {
    const emails = [...new Set(rows.map((row) => row.teacherEmail.trim()).filter((email) => email !== ''))];
    const semesters = await manager.query(
      `SELECT id, academic_year_start AS "academicYearStart", term FROM examcollect.semester`,
    );
    const administrativeClasses = await manager.query(`SELECT id, code::text AS code FROM examcollect.administrative_class`);
    // `email` là citext: `ANY($1::citext[])` so không phân biệt hoa-thường. `::text[]` sẽ so phân biệt và lặng lẽ
    // không thấy tài khoản gõ khác hoa-thường (bẫy đã gặp ở plan D1).
    const teachers = await manager.query(
      `SELECT id, email::text AS email, name, role::text AS role, is_active AS "isActive"
         FROM examcollect.account WHERE email = ANY($1::citext[])`,
      [emails],
    );
    const classes = await manager.query(
      `SELECT c.id, c.semester_id AS "semesterId", c.administrative_class_id AS "administrativeClassId",
              c.group_name AS "groupName", c.teacher_id AS "teacherId", t.name AS "teacherName"
         FROM examcollect.class c
         JOIN examcollect.account t ON t.id = c.teacher_id`,
    );
    return { semesters, administrativeClasses, teachers, classes };
  }

  private loadSemesters(manager: EntityManager): Promise<ExistingSemester[]> {
    return manager.query(
      `SELECT id, academic_year_start AS "academicYearStart", term,
              to_char(start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(end_date,   'YYYY-MM-DD') AS "endDate"
         FROM examcollect.semester`,
    );
  }

  private loadRooms(manager: EntityManager): Promise<ExistingRoom[]> {
    return manager.query(`SELECT id, name::text AS name, capacity FROM examcollect.room`);
  }

  private loadAdministrativeClasses(manager: EntityManager): Promise<ExistingAdministrativeClass[]> {
    return manager.query(`SELECT id, code::text AS code FROM examcollect.administrative_class`);
  }
}
