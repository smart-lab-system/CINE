import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { normalizeRoomName, roomNameProblem } from '../common/master-data-normalize';
import { findNearDuplicates } from '../common/near-duplicate';
import { CreateRoomDto, UpdateRoomDto } from './dto/room.dto';
import { RoomEntity } from './entities/room.entity';
import { nearDuplicateConflict, SimilarEntry } from './near-duplicate.error';
import { RoomView } from './course.types';

interface RoomRow {
  id: string;
  name: string;
  capacity: number | null;
  isActive: boolean;
  sessionCount: number;
}

/**
 * Phòng thi do admin khai; giảng viên chỉ chọn trong những phòng đang hoạt động
 * (spec §2.4). Nhập tay và import dùng chung `prepareName` (nguyên tắc 6).
 *
 * Thứ tự kiểm khi tạo/đổi tên: hợp lệ (400) -> trùng CỨNG (409 "đã tồn tại",
 * DB có khoá duy nhất citext) -> "gần giống" (409 NEAR_DUPLICATE, có thể xác
 * nhận bỏ qua). Trùng cứng đứng trước vì không có gì để xác nhận.
 */
@Injectable()
export class RoomService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  async list(opts: { activeOnly: boolean; withCounts: boolean }): Promise<RoomView[]> {
    const rows: RoomRow[] = await this.dataSource.query(
      `SELECT r.id, r.name::text AS name, r.capacity, r.is_active AS "isActive",
              (SELECT count(*)::int FROM examcollect.exam_session s WHERE s.room_id = r.id) AS "sessionCount"
         FROM examcollect.room r
        WHERE ($1::boolean IS FALSE OR r.is_active)
        ORDER BY lower(r.name::text), r.name::text`,
      [opts.activeOnly],
    );
    return rows.map((row) => this.toView(row, opts.withCounts));
  }

  async create(actorId: string, dto: CreateRoomDto): Promise<RoomView> {
    const name = this.prepareName(dto.name);
    return this.dataSource.transaction(async (manager) => {
      await this.assertNameFree(manager, name, null);
      if (!dto.confirmSimilar) {
        await this.assertNotNearDuplicate(manager, name, null);
      }
      const repo = manager.getRepository(RoomEntity);
      const saved = await repo.save(repo.create({ name, capacity: dto.capacity ?? null, isActive: true }));
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'room.create',
          targetType: 'room',
          targetId: saved.id,
          newValue: { targetLabel: saved.name, capacity: saved.capacity, isActive: saved.isActive },
        },
        manager,
      );
      return this.toView({ ...saved, sessionCount: 0 }, true);
    });
  }

  async update(actorId: string, id: string, dto: UpdateRoomDto): Promise<RoomView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RoomEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy phòng.');

      const next = {
        name: dto.name === undefined ? current.name : this.prepareName(dto.name),
        capacity: dto.capacity === undefined ? current.capacity : dto.capacity,
        isActive: dto.isActive ?? current.isActive,
      };
      const changed = (['name', 'capacity', 'isActive'] as const).filter((key) => next[key] !== current[key]);
      const sessionCount = await this.countSessions(manager, id);
      if (changed.length === 0) return this.toView({ ...current, sessionCount }, true);

      if (changed.includes('name')) {
        await this.assertNameFree(manager, next.name, id);
        if (!dto.confirmSimilar) {
          await this.assertNotNearDuplicate(manager, next.name, id);
        }
      }

      const before = { ...current };
      Object.assign(current, next);
      const saved = await repo.save(current);

      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = {};
      for (const key of changed) {
        oldValue[key] = before[key];
        newValue[key] = saved[key];
      }
      newValue.targetLabel = saved.name;
      await this.audit.recordUserAction(
        { actorId, action: 'room.update', targetType: 'room', targetId: id, oldValue, newValue },
        manager,
      );
      return this.toView({ ...saved, sessionCount }, true);
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RoomEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy phòng.');

      const sessionCount = await this.countSessions(manager, id);
      if (sessionCount > 0) {
        throw new ConflictException(
          `Phòng "${current.name}" đã có ${sessionCount} phiên thi nên không xoá được. ` +
            'Hãy tắt hoạt động để không ai chọn nó cho phiên mới, lịch sử vẫn giữ nguyên.',
        );
      }
      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'room.delete',
          targetType: 'room',
          targetId: id,
          oldValue: { targetLabel: current.name, capacity: current.capacity, isActive: current.isActive },
        },
        manager,
      );
    });
  }

  /**
   * Phòng cho một phiên MỚI: phải tồn tại và đang hoạt động. `is_active = false` nghĩa là không chọn được cho phiên
   * mới; phiên cũ vẫn tham chiếu được, nên kiểm này chỉ ở đường TẠO (và đường ĐỔI phòng ở plan F), không ở khoá ngoại.
   */
  async requireActiveForNewSession(roomId: string): Promise<RoomEntity> {
    // TypeORM BỎ QUA `null`/`undefined` trong `where`: không chặn ở đây thì `findOne({ where: { id: null } })` trả về MỘT PHÒNG
    // BẤT KỲ, và một phiên bị chuyển sang phòng đó mà không ai hay.
    if (!roomId) {
      throw new BadRequestException('Không tìm thấy phòng đã chọn.');
    }
    const room = await this.dataSource.getRepository(RoomEntity).findOne({ where: { id: roomId } });
    if (!room) {
      throw new BadRequestException('Không tìm thấy phòng đã chọn.');
    }
    if (!room.isActive) {
      throw new BadRequestException(`Phòng "${room.name}" đã ngừng hoạt động, hãy chọn phòng khác.`);
    }
    return room;
  }

  /** Chuẩn hoá rồi kiểm — dùng chung cho nhập tay và (plan E) import. */
  prepareName(raw: string): string {
    const name = normalizeRoomName(raw);
    const problem = roomNameProblem(name);
    if (problem) throw new BadRequestException(problem);
    return name;
  }

  private async countSessions(manager: EntityManager, roomId: string): Promise<number> {
    const [row] = await manager.query(
      `SELECT count(*)::int AS n FROM examcollect.exam_session WHERE room_id = $1`,
      [roomId],
    );
    return row.n;
  }

  private async assertNameFree(manager: EntityManager, name: string, excludeId: string | null): Promise<void> {
    const [row] = await manager.query(
      `SELECT name::text AS name FROM examcollect.room WHERE name = $1 AND ($2::uuid IS NULL OR id <> $2)`,
      [name, excludeId],
    );
    if (row) throw new ConflictException(`Phòng "${row.name}" đã tồn tại.`);
  }

  private async assertNotNearDuplicate(
    manager: EntityManager,
    name: string,
    excludeId: string | null,
  ): Promise<void> {
    const rows: SimilarEntry[] = await manager.query(
      `SELECT id, name::text AS name FROM examcollect.room WHERE ($1::uuid IS NULL OR id <> $1)`,
      [excludeId],
    );
    const similar = findNearDuplicates(name, rows, (row) => row.name).map((match) => match.candidate);
    if (similar.length > 0) throw nearDuplicateConflict('Phòng', name, similar);
  }

  private toView(row: RoomRow | (RoomEntity & { sessionCount: number }), withCounts: boolean): RoomView {
    return {
      id: row.id,
      name: row.name,
      capacity: row.capacity,
      isActive: row.isActive,
      ...(withCounts ? { sessionCount: row.sessionCount } : {}),
    };
  }
}
