import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoredObjectEntity } from '../entities/stored-object.entity';
import { CreateStoredObjectDto } from './dto/create-stored-object.dto';

@Injectable()
export class StoredObjectsService {
  constructor(
    @InjectRepository(StoredObjectEntity)
    private readonly objects: Repository<StoredObjectEntity>,
  ) {}

  async create(
    dto: CreateStoredObjectDto,
    uploadedBy: string,
  ): Promise<{ id: string }> {
    const saved = await this.objects.save(
      this.objects.create({
        bucketName: dto.bucketName,
        objectKey: dto.objectKey,
        objectUri: dto.objectUri,
        sha256: Buffer.from(dto.sha256Hex, 'hex'),
        sizeBytes: String(dto.sizeBytes),
        contentType: dto.contentType ?? null,
        uploadedBy,
      }),
    );
    return { id: saved.id };
  }
}
