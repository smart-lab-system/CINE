import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

export class BatchRenameWorkstationItemDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,64}$/)
  assetCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9.-]{0,62}$/)
  hostname?: string;
}

export class BatchRenameWorkstationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BatchRenameWorkstationItemDto)
  items!: BatchRenameWorkstationItemDto[];
}
