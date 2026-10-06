import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import {
  ImportAdministrativeClassesDto,
  ImportRoomsDto,
  ImportSemestersDto,
} from './dto/import.dto';
import { AdministrativeClassEntity } from './entities/administrative-class.entity';
import { RoomEntity } from './entities/room.entity';
import { SemesterEntity } from './entities/semester.entity';
import { runImport } from './import/import-runner';
import type { ImportResult } from './import/import.types';
import {
  planAdministrativeClassImport,
  type AdministrativeClassWrite,
  type ExistingAdministrativeClass,
} from './import/plan-administrative-class-import';
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

  // ----------------------------------------------------------------- nạp trạng thái hiện có

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
