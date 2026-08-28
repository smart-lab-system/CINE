import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaginationQueryDto } from '../../master-data/dto/common/pagination-query.dto';
import { SeatingTemplateEntity } from '../entities/seating-template.entity';
import { CreateSeatingTemplateDto } from './dto/create-seating-template.dto';
import { UpdateSeatingTemplateDto } from './dto/update-seating-template.dto';
import {
  SeatingTemplateListItemDto,
  SeatingTemplateViewDto,
} from './dto/seating-template-response.dto';
import {
  normalizeLayoutData,
  type TemplateSeatBlueprint,
} from './template-geometry';

@Injectable()
export class SeatingTemplatesService {
  constructor(
    @InjectRepository(SeatingTemplateEntity)
    private readonly templates: Repository<SeatingTemplateEntity>,
  ) {}

  async create(dto: CreateSeatingTemplateDto): Promise<{ id: string }> {
    const layoutData = dto.layoutData
      ? this.validatedLayoutData(dto.layoutData)
      : [];
    const template = await this.templates.save(
      this.templates.create({
        name: dto.name.trim(),
        description: dto.description?.trim() ? dto.description.trim() : null,
        canvasWidth: dto.canvasWidth ?? 1280,
        canvasHeight: dto.canvasHeight ?? 720,
        layoutData,
      }),
    );
    return { id: template.id };
  }

  async search(
    query: PaginationQueryDto,
  ): Promise<{ items: SeatingTemplateListItemDto[]; total: number }> {
    const qb = this.templates
      .createQueryBuilder('t')
      .where('t.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(t.name ILIKE :term OR t.description ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('t.name', 'ASC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((row) => this.toListItem(row)), total };
  }

  async findOne(id: string): Promise<SeatingTemplateViewDto> {
    return this.toView(await this.findActiveOrThrow(id));
  }

  async findActiveOrThrow(id: string): Promise<SeatingTemplateEntity> {
    const template = await this.templates.findOne({ where: { id } });
    if (!template || template.deletedAt) {
      throw new NotFoundException('Template not found');
    }
    return template;
  }

  async update(
    id: string,
    dto: UpdateSeatingTemplateDto,
  ): Promise<SeatingTemplateViewDto> {
    const template = await this.findActiveOrThrow(id);
    const patch: Partial<SeatingTemplateEntity> = {};

    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.description !== undefined) {
      patch.description = dto.description?.trim() ? dto.description.trim() : null;
    }
    if (dto.canvasWidth !== undefined) patch.canvasWidth = dto.canvasWidth;
    if (dto.canvasHeight !== undefined) patch.canvasHeight = dto.canvasHeight;
    if (dto.layoutData !== undefined) {
      patch.layoutData = this.validatedLayoutData(dto.layoutData);
    }

    if (Object.keys(patch).length > 0) {
      await this.templates.update(id, patch);
    }

    return this.toView(await this.findActiveOrThrow(id));
  }

  async remove(id: string): Promise<void> {
    await this.findActiveOrThrow(id);
    await this.templates.update(id, { deletedAt: new Date() });
  }

  private validatedLayoutData(
    items: CreateSeatingTemplateDto['layoutData'],
  ): TemplateSeatBlueprint[] {
    try {
      return normalizeLayoutData(
        (items ?? []).map((item) => ({
          x: item.x,
          y: item.y,
          label: item.label,
          shape: item.shape ?? 'rect',
          rotation: item.rotation ?? 0,
          rowNo: item.rowNo ?? null,
          columnNo: item.columnNo ?? null,
        })),
      );
    } catch {
      throw new BadRequestException('layoutData is invalid');
    }
  }

  private toListItem(
    template: SeatingTemplateEntity,
  ): SeatingTemplateListItemDto {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      canvasWidth: template.canvasWidth,
      canvasHeight: template.canvasHeight,
      seatCount: Array.isArray(template.layoutData)
        ? template.layoutData.length
        : 0,
    };
  }

  private toView(template: SeatingTemplateEntity): SeatingTemplateViewDto {
    let layoutData: TemplateSeatBlueprint[] = [];
    try {
      layoutData = normalizeLayoutData(template.layoutData ?? []);
    } catch {
      layoutData = [];
    }
    return {
      ...this.toListItem(template),
      layoutData,
    };
  }
}
