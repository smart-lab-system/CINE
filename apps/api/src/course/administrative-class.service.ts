import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
} from '../common/master-data-normalize';
import { findNearDuplicates } from '../common/near-duplicate';
import {
  CreateAdministrativeClassDto,
  UpdateAdministrativeClassDto,
} from './dto/administrative-class.dto';
import { AdministrativeClassEntity } from './entities/administrative-class.entity';
import { nearDuplicateConflict } from './near-duplicate.error';
import { AdministrativeClassView } from './course.types';

/**
 * Danh mục lớp danh nghĩa (spec §2.2). Mã CHỈ được tạo ở đây (nhập tay hoặc
 * import); form tạo lớp chỉ chọn. Hệ thống vẫn không biết trường có những mã nào
 * thật — danh mục đúng tới mức danh sách của admin đúng — nhưng lỗi gõ giờ xảy ra
 * MỘT lần cho cả danh mục thay vì mỗi lần tạo lớp.
 *
 * Xoá chỉ khi không lớp nào dùng. Mã nhập trước khi có lớp là trạng thái BÌNH
 * THƯỜNG, nên không có "mồ côi tự dọn": một mã không có lớp nào không bao giờ tự
 * biến mất.
 */
@Injectable()
export class AdministrativeClassService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async list(): Promise<AdministrativeClassView[]> {
    const rows: AdministrativeClassView[] = await this.dataSource.query(
      `SELECT a.id, a.code::text AS code,
              (SELECT count(*)::int FROM examcollect.class c WHERE c.administrative_class_id = a.id) AS "classCount"
         FROM examcollect.administrative_class a
        ORDER BY a.code::text`,
    );
    return rows;
  }

  async create(actorId: string, dto: CreateAdministrativeClassDto): Promise<AdministrativeClassView> {
    const code = this.prepareCode(dto.code);
    return this.dataSource.transaction(async (manager) => {
      await this.assertCodeFree(manager, code, null);
      if (!dto.confirmSimilar) {
        await this.assertNotNearDuplicate(manager, code, null);
      }
      const repo = manager.getRepository(AdministrativeClassEntity);
      const saved = await repo.save(repo.create({ code }));
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'administrative_class.create',
          targetType: 'administrative_class',
          targetId: saved.id,
          newValue: { targetLabel: saved.code, code: saved.code },
        },
        manager,
      );
      return { id: saved.id, code: saved.code, classCount: 0 };
    });
  }

  async update(
    actorId: string,
    id: string,
    dto: UpdateAdministrativeClassDto,
  ): Promise<AdministrativeClassView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AdministrativeClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy mã lớp danh nghĩa.');

      const classCount = await this.countClasses(manager, id);
      if (dto.code === undefined) return { id, code: current.code, classCount };

      const next = this.prepareCode(dto.code);
      // `code` là citext: "dhktpm18a" và "DHKTPM18A" bằng nhau, nên đổi hoa-thường
      // của chính mình không phải một thay đổi (mã đã được chuẩn hoá HOA ở tầng ghi).
      if (next === current.code) return { id, code: current.code, classCount };

      await this.assertCodeFree(manager, next, id);
      if (!dto.confirmSimilar) {
        await this.assertNotNearDuplicate(manager, next, id);
      }

      const previous = current.code;
      current.code = next;
      const saved = await repo.save(current);
      // Mọi lớp dùng mã này đổi nhãn theo, kể cả lớp của kỳ cũ: nhãn lớp là biểu
      // thức, không phải bản chụp (spec §2.2). Đó là mục đích của việc sửa lỗi gõ.
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'administrative_class.update',
          targetType: 'administrative_class',
          targetId: id,
          oldValue: { code: previous },
          newValue: { targetLabel: saved.code, code: saved.code },
        },
        manager,
      );
      return { id, code: saved.code, classCount };
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AdministrativeClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy mã lớp danh nghĩa.');

      const classCount = await this.countClasses(manager, id);
      if (classCount > 0) {
        throw new ConflictException(
          `Mã ${current.code} còn ${classCount} lớp đang dùng nên không xoá được. ` +
            'Hãy chuyển hoặc xoá các lớp đó trước.',
        );
      }
      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'administrative_class.delete',
          targetType: 'administrative_class',
          targetId: id,
          oldValue: { targetLabel: current.code, code: current.code },
        },
        manager,
      );
    });
  }

  /** Chuẩn hoá rồi kiểm — dùng chung cho nhập tay và (plan E) import. */
  prepareCode(raw: string): string {
    const code = normalizeAdministrativeCode(raw);
    const problem = administrativeCodeProblem(code);
    if (problem) throw new BadRequestException(problem);
    return code;
  }

  private async countClasses(manager: EntityManager, id: string): Promise<number> {
    const [row] = await manager.query(
      `SELECT count(*)::int AS n FROM examcollect.class WHERE administrative_class_id = $1`,
      [id],
    );
    return row.n;
  }

  private async assertCodeFree(manager: EntityManager, code: string, excludeId: string | null): Promise<void> {
    const [row] = await manager.query(
      `SELECT code::text AS code FROM examcollect.administrative_class
        WHERE code = $1 AND ($2::uuid IS NULL OR id <> $2)`,
      [code, excludeId],
    );
    if (row) throw new ConflictException(`Mã ${row.code} đã tồn tại trong Danh mục lớp danh nghĩa.`);
  }

  private async assertNotNearDuplicate(
    manager: EntityManager,
    code: string,
    excludeId: string | null,
  ): Promise<void> {
    const rows: { id: string; name: string }[] = await manager.query(
      `SELECT id, code::text AS name FROM examcollect.administrative_class
        WHERE ($1::uuid IS NULL OR id <> $1)`,
      [excludeId],
    );
    const similar = findNearDuplicates(code, rows, (row) => row.name).map((match) => match.candidate);
    if (similar.length > 0) throw nearDuplicateConflict('Mã lớp danh nghĩa', code, similar);
  }
}
