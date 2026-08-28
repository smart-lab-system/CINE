import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { WorkstationEntity } from '../entities/workstation.entity';
import { LabsService } from '../labs/labs.service';
import { BatchRenameWorkstationsDto } from './dto/batch-rename-workstations.dto';
import { CreateWorkstationDto } from './dto/create-workstation.dto';
import { UpdateWorkstationDto } from './dto/update-workstation.dto';
import { WorkstationViewDto } from './dto/workstation-response.dto';

@Injectable()
export class WorkstationsService {
  constructor(
    @InjectRepository(WorkstationEntity)
    private readonly workstations: Repository<WorkstationEntity>,
    private readonly labs: LabsService,
  ) {}

  async create(
    labId: string,
    dto: CreateWorkstationDto,
  ): Promise<{ id: string }> {
    await this.labs.findActiveOrThrow(labId);
    const workstation = await this.workstations.save(
      this.workstations.create({
        labId,
        assetCode: dto.assetCode,
        hostname: dto.hostname,
        macAddress: dto.macAddress ?? null,
        staticIpAddress: dto.staticIpAddress ?? null,
        serialNumber: dto.serialNumber ?? null,
        operatingSystem: dto.operatingSystem ?? null,
        isEnabled: dto.isEnabled ?? true,
        type: dto.type ?? 'client',
        status: dto.status ?? 'available',
        notes: dto.notes ?? null,
      }),
    );
    return { id: workstation.id };
  }

  async search(
    labId: string,
    query: PaginationQueryDto,
  ): Promise<{ items: WorkstationViewDto[]; total: number }> {
    await this.labs.findActiveOrThrow(labId);
    const qb = this.workstations
      .createQueryBuilder('w')
      .where('w.lab_id = :labId', { labId })
      .andWhere('w.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(w.asset_code ILIKE :term OR w.hostname ILIKE :term OR w.serial_number ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('w.asset_code', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((w) => this.toView(w)), total };
  }

  async findOne(labId: string, id: string): Promise<WorkstationViewDto> {
    return this.toView(await this.findActiveOrThrow(labId, id));
  }

  async update(
    labId: string,
    id: string,
    dto: UpdateWorkstationDto,
  ): Promise<WorkstationViewDto> {
    const workstation = await this.findActiveOrThrow(labId, id);
    await this.workstations.update(id, {
      assetCode: dto.assetCode ?? workstation.assetCode,
      hostname: dto.hostname ?? workstation.hostname,
      macAddress:
        dto.macAddress === undefined ? workstation.macAddress : dto.macAddress,
      staticIpAddress:
        dto.staticIpAddress === undefined
          ? workstation.staticIpAddress
          : dto.staticIpAddress,
      serialNumber:
        dto.serialNumber === undefined
          ? workstation.serialNumber
          : dto.serialNumber,
      operatingSystem:
        dto.operatingSystem === undefined
          ? workstation.operatingSystem
          : dto.operatingSystem,
      isEnabled: dto.isEnabled ?? workstation.isEnabled,
      type: dto.type ?? workstation.type,
      status: dto.status ?? workstation.status,
      notes: dto.notes === undefined ? workstation.notes : dto.notes,
    });
    return this.toView(await this.findActiveOrThrow(labId, id));
  }

  async remove(labId: string, id: string): Promise<void> {
    await this.findActiveOrThrow(labId, id);
    await this.workstations.update(id, { deletedAt: new Date() });
  }

  async batchRename(
    labId: string,
    dto: BatchRenameWorkstationsDto,
  ): Promise<{ items: WorkstationViewDto[]; total: number }> {
    await this.labs.findActiveOrThrow(labId);
    this.assertBatchRenamePayload(dto);

    const ids = dto.items.map((item) => item.id);

    return this.workstations.manager.transaction(async (manager) => {
      const repo = manager.getRepository(WorkstationEntity);
      const rows = await repo.find({ where: { id: In(ids) } });
      const active = rows.filter(
        (row) => !row.deletedAt && row.labId === labId,
      );
      if (active.length !== ids.length) {
        throw new BadRequestException(
          'One or more workstations do not belong to this lab',
        );
      }

      const token = randomUUID();
      for (const [index, item] of dto.items.entries()) {
        const tmp = `tmp.${token}.${index}`;
        await repo.update(item.id, {
          ...(item.assetCode !== undefined ? { assetCode: tmp } : {}),
          ...(item.hostname !== undefined ? { hostname: tmp } : {}),
        });
      }
      for (const item of dto.items) {
        await repo.update(item.id, {
          ...(item.assetCode !== undefined ? { assetCode: item.assetCode } : {}),
          ...(item.hostname !== undefined ? { hostname: item.hostname } : {}),
        });
      }

      const updated = await repo.find({ where: { id: In(ids) } });
      const byId = new Map(updated.map((row) => [row.id, row]));
      const items = ids.map((id) => this.toView(byId.get(id)!));
      return { items, total: items.length };
    });
  }

  private assertBatchRenamePayload(dto: BatchRenameWorkstationsDto): void {
    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate workstation ids');
    }

    const missingFields = dto.items.some(
      (item) => item.assetCode === undefined && item.hostname === undefined,
    );
    if (missingFields) {
      throw new BadRequestException(
        'Each item must include assetCode and/or hostname',
      );
    }

    const assetCodes = dto.items
      .map((item) => item.assetCode)
      .filter((value): value is string => value !== undefined);
    const hostnames = dto.items
      .map((item) => item.hostname)
      .filter((value): value is string => value !== undefined);

    if (this.hasCaseInsensitiveDuplicates(assetCodes)) {
      throw new ConflictException(
        'This request conflicts with an existing record.',
      );
    }
    if (this.hasCaseInsensitiveDuplicates(hostnames)) {
      throw new ConflictException(
        'This request conflicts with an existing record.',
      );
    }
  }

  private hasCaseInsensitiveDuplicates(values: string[]): boolean {
    const normalized = values.map((value) => value.toLowerCase());
    return new Set(normalized).size !== normalized.length;
  }

  async findActiveOrThrow(
    labId: string,
    id: string,
  ): Promise<WorkstationEntity> {
    await this.labs.findActiveOrThrow(labId);
    const workstation = await this.workstations.findOne({ where: { id } });
    if (!workstation || workstation.deletedAt || workstation.labId !== labId) {
      throw new NotFoundException('Workstation not found');
    }
    return workstation;
  }

  private toView(workstation: WorkstationEntity): WorkstationViewDto {
    return {
      id: workstation.id,
      labId: workstation.labId,
      agentId: workstation.agentId,
      assetCode: workstation.assetCode,
      hostname: workstation.hostname,
      macAddress: workstation.macAddress,
      staticIpAddress: workstation.staticIpAddress,
      serialNumber: workstation.serialNumber,
      operatingSystem: workstation.operatingSystem,
      isEnabled: workstation.isEnabled,
      type: workstation.type,
      status: workstation.status,
      notes: workstation.notes,
    };
  }
}
