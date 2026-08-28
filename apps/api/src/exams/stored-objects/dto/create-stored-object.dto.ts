import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

export class CreateStoredObjectDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
  bucketName!: string;

  @IsString()
  @Length(1, 1024)
  objectKey!: string;

  @IsString()
  @Matches(/^[a-z][a-z0-9+.-]*:\/\//)
  objectUri!: string;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  sha256Hex!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  contentType?: string;
}
