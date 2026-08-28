import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { WORKSTATION_STATUSES, WORKSTATION_TYPES } from './create-workstation.dto';

export class UpdateWorkstationDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,64}$/)
  assetCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/)
  hostname?: string;

  @IsOptional()
  @IsString()
  macAddress?: string | null;

  @IsOptional()
  @IsString()
  staticIpAddress?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  serialNumber?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  operatingSystem?: string | null;

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
  notes?: string | null;
}
