import { IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { RoomStatus } from '../entities/room.entity';

const STATUSES: RoomStatus[] = ['active', 'maintenance', 'inactive'];

export class CreateRoomDto {
  @IsString()
  @Length(1, 50)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  building?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  floor?: string | null;

  @IsIn(STATUSES)
  status!: RoomStatus;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  building?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  floor?: string | null;

  @IsOptional()
  @IsIn(STATUSES)
  status?: RoomStatus;
}

export class ListRoomsDto {
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
  @IsIn(STATUSES)
  status?: RoomStatus;

  @IsOptional()
  @IsString()
  search?: string;
}
