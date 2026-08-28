import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { LabEntity } from '../entities/lab.entity';
import {
  LabRoomProposalDeviceRecord,
  LabRoomProposalEntity,
} from '../entities/lab-room-proposal.entity';
import { WorkstationEntity } from '../entities/workstation.entity';
import { CreateLabRoomProposalDto } from './dto/create-lab-room-proposal.dto';
import { LabRoomProposalViewDto } from './dto/lab-room-proposal-response.dto';
import {
  mapProposalDeviceToWorkstation,
  normalizeProposalLabCode,
} from './proposal-lab-mapping';

@Injectable()
export class LabRoomProposalsService {
  constructor(
    @InjectRepository(LabRoomProposalEntity)
    private readonly proposals: Repository<LabRoomProposalEntity>,
    @InjectRepository(LabEntity)
    private readonly labs: Repository<LabEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateLabRoomProposalDto,
    submittedBy: string,
    submittedByName: string,
  ): Promise<{ id: string }> {
    const devices = dto.devices.map((device) => this.normalizeDevice(device));
    const proposal = await this.proposals.save(
      this.proposals.create({
        roomCode: dto.roomCode.trim(),
        roomName: dto.roomName.trim(),
        building: dto.building?.trim() || null,
        floor: dto.floor?.trim() || null,
        devices,
        submittedBy,
        submittedByName,
      }),
    );
    return { id: proposal.id };
  }

  async search(
    query: PaginationQueryDto,
  ): Promise<{ items: LabRoomProposalViewDto[]; total: number }> {
    const qb = this.proposals
      .createQueryBuilder('p')
      .where('p.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(p.room_code ILIKE :term OR p.room_name ILIKE :term OR p.building ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('p.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((row) => this.toView(row)), total };
  }

  async findOne(id: string): Promise<LabRoomProposalViewDto> {
    return this.toView(await this.findActiveOrThrow(id));
  }

  async createLabFromProposal(
    id: string,
  ): Promise<{ labId: string; code: string; workstationCount: number }> {
    const proposal = await this.findActiveOrThrow(id);
    const code = normalizeProposalLabCode(proposal.roomCode);

    const existing = await this.labs
      .createQueryBuilder('l')
      .where('l.deleted_at IS NULL')
      .andWhere('l.code = :code', { code })
      .getOne();
    if (existing) {
      throw new ConflictException(
        `Đã tồn tại phòng máy với mã "${code}".`,
      );
    }

    const capacity = Math.max(proposal.devices.length, 1);

    return this.dataSource.transaction(async (manager) => {
      const lab = await manager.save(
        manager.create(LabEntity, {
          code,
          name: proposal.roomName,
          building: proposal.building,
          floor: proposal.floor,
          capacity,
          description: `Tạo từ đề xuất phòng lab (${proposal.id}).`,
          isActive: true,
        }),
      );

      const usedMacs = new Set<string>();
      for (const [index, device] of proposal.devices.entries()) {
        const mapped = mapProposalDeviceToWorkstation(code, device, index, usedMacs);
        await manager.save(
          manager.create(WorkstationEntity, {
            labId: lab.id,
            assetCode: mapped.assetCode,
            hostname: mapped.hostname,
            macAddress: mapped.macAddress,
            staticIpAddress: mapped.staticIpAddress,
            serialNumber: mapped.serialNumber,
            operatingSystem: mapped.operatingSystem,
            type: mapped.type,
            status: 'available',
            isEnabled: true,
            notes: mapped.notes,
          }),
        );
      }

      return {
        labId: lab.id,
        code: lab.code,
        workstationCount: proposal.devices.length,
      };
    });
  }

  private async findActiveOrThrow(id: string): Promise<LabRoomProposalEntity> {
    const proposal = await this.proposals.findOne({ where: { id } });
    if (!proposal || proposal.deletedAt) {
      throw new NotFoundException('Lab room proposal not found');
    }
    return proposal;
  }

  private normalizeDevice(
    device: CreateLabRoomProposalDto['devices'][number],
  ): LabRoomProposalDeviceRecord {
    const machineId = device.machineId.trim();
    const hostname = device.hostname?.trim() || machineId;
    return {
      role: device.role,
      machineId,
      hostname,
      macAddress: device.macAddress?.trim() ?? '',
      osEdition: device.osEdition?.trim() ?? '',
      osVersion: device.osVersion?.trim() ?? '',
      serial: device.serial?.trim() || machineId,
      ipv4: device.ipv4?.trim() || undefined,
      username: device.username?.trim() || undefined,
    };
  }

  private toView(row: LabRoomProposalEntity): LabRoomProposalViewDto {
    return {
      id: row.id,
      roomCode: row.roomCode,
      roomName: row.roomName,
      building: row.building,
      floor: row.floor,
      devices: row.devices,
      submittedBy: row.submittedBy,
      submittedByName: row.submittedByName,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
