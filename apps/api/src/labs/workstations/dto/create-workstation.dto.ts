import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export const WORKSTATION_STATUSES = [
  'available',
  'maintenance',
  'broken',
  'retired',
] as const;

export const WORKSTATION_TYPES = ['master', 'client'] as const;

export class CreateWorkstationDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,64}$/)
  assetCode!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/)
  hostname!: string;

  @IsOptional()
  @IsString()
  macAddress?: string;

  @IsOptional()
  @IsString()
  staticIpAddress?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  operatingSystem?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsIn(WORKSTATION_TYPES)
  type?: (typeof WORKSTATION_TYPES)[number];

  @IsOptional()
  @IsIn(WORKSTATION_STATUSES)
  status?: (typeof WORKSTATION_STATUSES)[number];

  @IsOptional()
  @IsString()
  notes?: string;
}
