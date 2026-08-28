import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { LabLayoutEntity } from '../entities/lab-layout.entity';
import { LabSeatEntity } from '../entities/lab-seat.entity';
import { WorkstationEntity } from '../entities/workstation.entity';
import { LabsService } from '../labs/labs.service';
import { SeatingTemplatesService } from '../templates/seating-templates.service';
import { CreateLayoutDto } from './dto/create-layout.dto';
import { UpdateLayoutDto } from './dto/update-layout.dto';
import { ApplyTemplateDto } from './dto/apply-template.dto';
import {
  BulkUpsertSeatsDto,
  SeatUpsertItemDto,
} from './dto/bulk-upsert-seats.dto';
import {
  LayoutDetailDto,
  LayoutViewDto,
  SeatViewDto,
} from './dto/layout-response.dto';
import {
  instantiateLayoutData,
  normalizeLayoutData,
  uniquifySeatCodes,
} from '../templates/template-geometry';

@Injectable()
export class LayoutsService {
  constructor(
    @InjectRepository(LabLayoutEntity)
    private readonly layouts: Repository<LabLayoutEntity>,
    @InjectRepository(LabSeatEntity)
    private readonly seats: Repository<LabSeatEntity>,
    @InjectRepository(WorkstationEntity)
    private readonly workstations: Repository<WorkstationEntity>,
    private readonly labs: LabsService,
    private readonly seatingTemplates: SeatingTemplatesService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    labId: string,
    dto: CreateLayoutDto,
  ): Promise<{ id: string }> {
    await this.labs.findActiveOrThrow(labId);

    return this.dataSource.transaction(async (manager) => {
      const layoutRepo = manager.getRepository(LabLayoutEntity);
      const maxRow = await layoutRepo
        .createQueryBuilder('l')
        .select('MAX(l.version_no)', 'max')
        .where('l.lab_id = :labId', { labId })
        .andWhere('l.deleted_at IS NULL')
        .getRawOne<{ max: string | null }>();
      const versionNo = (maxRow?.max ? Number(maxRow.max) : 0) + 1;
      const wantActive = dto.isActive === true;

      if (wantActive) {
        await this.deactivateOthers(layoutRepo, labId);
      }

      const layout = await layoutRepo.save(
        layoutRepo.create({
          labId,
          name: dto.name,
          versionNo,
          canvasWidth: dto.canvasWidth ?? 1280,
          canvasHeight: dto.canvasHeight ?? 720,
          isActive: wantActive,
        }),
      );
      return { id: layout.id };
    });
  }

  async search(
    labId: string,
    query: PaginationQueryDto,
  ): Promise<{ items: LayoutViewDto[]; total: number }> {
    await this.labs.findActiveOrThrow(labId);
    const qb = this.layouts
      .createQueryBuilder('l')
      .where('l.lab_id = :labId', { labId })
      .andWhere('l.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('l.name ILIKE :term', { term: `%${query.search}%` });
    }

    qb.orderBy('l.version_no', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((l) => this.toLayoutView(l)), total };
  }

  async findOne(labId: string, id: string): Promise<LayoutDetailDto> {
    const layout = await this.findActiveLayoutOrThrow(labId, id);
    const activeSeats = await this.seats
      .createQueryBuilder('s')
      .where('s.layout_id = :id', { id })
      .andWhere('s.deleted_at IS NULL')
      .orderBy('s.seat_code', 'ASC')
      .getMany();

    return {
      ...this.toLayoutView(layout),
      seats: activeSeats.map((s) => this.toSeatView(s)),
    };
  }

  async update(
    labId: string,
    id: string,
    dto: UpdateLayoutDto,
  ): Promise<LayoutViewDto> {
    const layout = await this.findActiveLayoutOrThrow(labId, id);

    return this.dataSource.transaction(async (manager) => {
      const layoutRepo = manager.getRepository(LabLayoutEntity);

      if (dto.isActive === true && !layout.isActive) {
        await this.deactivateOthers(layoutRepo, labId);
      }

      await layoutRepo.update(id, {
        name: dto.name ?? layout.name,
        canvasWidth: dto.canvasWidth ?? layout.canvasWidth,
        canvasHeight: dto.canvasHeight ?? layout.canvasHeight,
        isActive: dto.isActive === undefined ? layout.isActive : dto.isActive,
      });

      const updated = await layoutRepo.findOneOrFail({ where: { id } });
      return this.toLayoutView(updated);
    });
  }

  async remove(labId: string, id: string): Promise<void> {
    await this.findActiveLayoutOrThrow(labId, id);
    await this.layouts.update(id, { deletedAt: new Date(), isActive: false });
  }

  async activate(labId: string, id: string): Promise<LayoutViewDto> {
    await this.findActiveLayoutOrThrow(labId, id);

    return this.dataSource.transaction(async (manager) => {
      const layoutRepo = manager.getRepository(LabLayoutEntity);
      await this.deactivateOthers(layoutRepo, labId);
      await layoutRepo.update(id, { isActive: true });
      const updated = await layoutRepo.findOneOrFail({ where: { id } });
      return this.toLayoutView(updated);
    });
  }

  async applyTemplate(
    labId: string,
    layoutId: string,
    dto: ApplyTemplateDto,
  ): Promise<LayoutDetailDto> {
    const layout = await this.findActiveLayoutOrThrow(labId, layoutId);
    const template = await this.seatingTemplates.findActiveOrThrow(
      dto.templateId,
    );

    let layoutData;
    try {
      layoutData = normalizeLayoutData(template.layoutData ?? []);
    } catch {
      throw new BadRequestException('Template layout_data is invalid');
    }

    const matchCanvas = dto.matchCanvas === true;
    const targetWidth = matchCanvas ? template.canvasWidth : layout.canvasWidth;
    const targetHeight = matchCanvas
      ? template.canvasHeight
      : layout.canvasHeight;
    const mode = dto.mode ?? 'replace';

    const instantiated = instantiateLayoutData(
      layoutData,
      targetWidth,
      targetHeight,
    );

    await this.dataSource.transaction(async (manager) => {
      const layoutRepo = manager.getRepository(LabLayoutEntity);
      const seatRepo = manager.getRepository(LabSeatEntity);

      if (matchCanvas) {
        await layoutRepo.update(layoutId, {
          canvasWidth: targetWidth,
          canvasHeight: targetHeight,
        });
      }

      const existing = await seatRepo
        .createQueryBuilder('s')
        .where('s.layout_id = :layoutId', { layoutId })
        .andWhere('s.deleted_at IS NULL')
        .getMany();

      const incoming =
        mode === 'append'
          ? uniquifySeatCodes(
              instantiated,
              existing.map((s) => s.seatCode),
            )
          : uniquifySeatCodes(instantiated, []);

      if (mode === 'replace' && existing.length > 0) {
        await seatRepo
          .createQueryBuilder()
          .update(LabSeatEntity)
          .set({ deletedAt: () => 'now()' })
          .whereInIds(existing.map((s) => s.id))
          .execute();
      }

      if (incoming.length > 0) {
        await seatRepo.save(
          incoming.map((seat) =>
            seatRepo.create({
              layoutId,
              labId,
              seatCode: seat.seatCode,
              workstationId: null,
              rowNo: seat.rowNo,
              columnNo: seat.columnNo,
              positionX: String(seat.positionX),
              positionY: String(seat.positionY),
              rotationDegrees: String(seat.rotationDegrees),
              shape: seat.shape,
              isDisabled: false,
              notes: null,
            }),
          ),
        );
      }
    });

    return this.findOne(labId, layoutId);
  }

  async bulkUpsertSeats(
    labId: string,
    layoutId: string,
    dto: BulkUpsertSeatsDto,
  ): Promise<{ items: SeatViewDto[]; total: number }> {
    await this.findActiveLayoutOrThrow(labId, layoutId);
    await this.assertWorkstationsBelongToLab(labId, dto.seats);

    return this.dataSource.transaction(async (manager) => {
      const seatRepo = manager.getRepository(LabSeatEntity);
      const existing = await seatRepo
        .createQueryBuilder('s')
        .where('s.layout_id = :layoutId', { layoutId })
        .andWhere('s.deleted_at IS NULL')
        .getMany();

      const keepIds = new Set(
        dto.seats.filter((s) => s.id).map((s) => s.id as string),
      );
      const toDelete = existing.filter((s) => !keepIds.has(s.id));
      if (toDelete.length > 0) {
        await seatRepo
          .createQueryBuilder()
          .update(LabSeatEntity)
          .set({ deletedAt: () => 'now()' })
          .whereInIds(toDelete.map((s) => s.id))
          .execute();
      }

      for (const item of dto.seats) {
        if (item.id) {
          const current = existing.find((s) => s.id === item.id);
          if (!current) {
            throw new NotFoundException(`Seat ${item.id} not found in layout`);
          }
          await seatRepo.update(item.id, {
            seatCode: item.seatCode,
            workstationId: item.workstationId ?? null,
            rowNo: item.rowNo ?? null,
            columnNo: item.columnNo ?? null,
            positionX: String(item.positionX),
            positionY: String(item.positionY),
            rotationDegrees: String(item.rotationDegrees ?? 0),
            shape: item.shape ?? current.shape ?? 'rect',
            isDisabled: item.isDisabled ?? false,
            notes: item.notes ?? null,
          });
        } else {
          await seatRepo.save(
            seatRepo.create({
              layoutId,
              labId,
              seatCode: item.seatCode,
              workstationId: item.workstationId ?? null,
              rowNo: item.rowNo ?? null,
              columnNo: item.columnNo ?? null,
              positionX: String(item.positionX),
              positionY: String(item.positionY),
              rotationDegrees: String(item.rotationDegrees ?? 0),
              shape: item.shape ?? 'rect',
              isDisabled: item.isDisabled ?? false,
              notes: item.notes ?? null,
            }),
          );
        }
      }

      const items = await seatRepo
        .createQueryBuilder('s')
        .where('s.layout_id = :layoutId', { layoutId })
        .andWhere('s.deleted_at IS NULL')
        .orderBy('s.seat_code', 'ASC')
        .getMany();

      return {
        items: items.map((s) => this.toSeatView(s)),
        total: items.length,
      };
    });
  }

  async removeSeat(
    labId: string,
    layoutId: string,
    seatId: string,
  ): Promise<void> {
    await this.findActiveLayoutOrThrow(labId, layoutId);
    const seat = await this.seats
      .createQueryBuilder('s')
      .where('s.id = :seatId', { seatId })
      .andWhere('s.layout_id = :layoutId', { layoutId })
      .andWhere('s.lab_id = :labId', { labId })
      .andWhere('s.deleted_at IS NULL')
      .getOne();
    if (!seat) {
      throw new NotFoundException('Seat not found');
    }
    await this.seats.update(seatId, { deletedAt: new Date() });
  }

  private async deactivateOthers(
    layoutRepo: Repository<LabLayoutEntity>,
    labId: string,
  ): Promise<void> {
    await layoutRepo
      .createQueryBuilder()
      .update(LabLayoutEntity)
      .set({ isActive: false })
      .where('lab_id = :labId', { labId })
      .andWhere('is_active = true')
      .andWhere('deleted_at IS NULL')
      .execute();
  }

  private async findActiveLayoutOrThrow(
    labId: string,
    id: string,
  ): Promise<LabLayoutEntity> {
    await this.labs.findActiveOrThrow(labId);
    const layout = await this.layouts.findOne({ where: { id } });
    if (!layout || layout.deletedAt || layout.labId !== labId) {
      throw new NotFoundException('Layout not found');
    }
    return layout;
  }

  private async assertWorkstationsBelongToLab(
    labId: string,
    seats: SeatUpsertItemDto[],
  ): Promise<void> {
    const ids = [
      ...new Set(
        seats
          .map((s) => s.workstationId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (ids.length === 0) return;

    const rows = await this.workstations.find({
      where: { id: In(ids), labId },
    });
    const active = rows.filter((w) => !w.deletedAt);
    if (active.length !== ids.length) {
      throw new BadRequestException(
        'One or more workstations do not belong to this lab',
      );
    }
  }

  private toLayoutView(layout: LabLayoutEntity): LayoutViewDto {
    return {
      id: layout.id,
      labId: layout.labId,
      name: layout.name,
      versionNo: layout.versionNo,
      canvasWidth: layout.canvasWidth,
      canvasHeight: layout.canvasHeight,
      isActive: layout.isActive,
    };
  }

  private toSeatView(seat: LabSeatEntity): SeatViewDto {
    return {
      id: seat.id,
      layoutId: seat.layoutId,
      labId: seat.labId,
      workstationId: seat.workstationId,
      seatCode: seat.seatCode,
      rowNo: seat.rowNo,
      columnNo: seat.columnNo,
      positionX: Number(seat.positionX),
      positionY: Number(seat.positionY),
      rotationDegrees: Number(seat.rotationDegrees),
      shape: seat.shape ?? 'rect',
      isDisabled: seat.isDisabled,
      notes: seat.notes,
    };
  }
}
