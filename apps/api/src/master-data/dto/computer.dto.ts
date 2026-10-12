import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { ComputerStatus } from '../entities/computer.entity';

const STATUSES: ComputerStatus[] = ['active', 'maintenance', 'inactive'];

export class CreateComputerDto {
  @IsUUID()
  roomId!: string;

  @IsString()
  @Length(1, 100)
  hostname!: string;

  @IsString()
  @Length(1, 100)
  location!: string;

  @IsString()
  @Length(1, 200)
  cpu!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ramGb!: number;

  @IsString()
  @Length(1, 200)
  storage!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  gpu?: string | null;

  @IsString()
  @Length(1, 100)
  os!: string;

  @IsOptional()
  @IsString()
  @Length(1, 45)
  ipAddress?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 17)
  macAddress?: string | null;

  @IsIn(STATUSES)
  status!: ComputerStatus;
}

export class UpdateComputerDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  location?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  cpu?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ramGb?: number;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  storage?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  gpu?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  os?: string;

  @IsOptional()
  @IsString()
  @Length(1, 45)
  ipAddress?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 17)
  macAddress?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: ComputerStatus;
}

export class ListComputersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsIn(STATUSES)
  status?: ComputerStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
