import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateCatalogExtensionDto {
  @IsString()
  @MaxLength(200)
  identifier!: string;

  @IsString()
  @MaxLength(200)
  displayName!: string;

  @IsString()
  @MaxLength(200)
  publisher!: string;

  @IsOptional()
  @IsString()
  publishedAt?: string;

  @IsOptional()
  @IsString()
  lastReleasedAt?: string;
}

export class UpdateCatalogExtensionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  publisher?: string;

  @IsOptional()
  @IsString()
  publishedAt?: string | null;

  @IsOptional()
  @IsString()
  lastReleasedAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCatalogVersionDto {
  @IsString()
  @MaxLength(50)
  version!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CatalogFromScanDto {
  @IsString()
  @MaxLength(200)
  extensionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;
}

export class CreatePolicyItemDto {
  @IsString()
  @MaxLength(200)
  extensionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  minVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  maxVersion?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateCoursePolicyItemDto extends CreatePolicyItemDto {
  @IsUUID()
  courseId!: string;
}

export class EffectiveQueryDto {
  @IsOptional()
  @IsUUID()
  courseId?: string;

  @IsOptional()
  @IsUUID()
  examSessionId?: string;
}

export class BatchScanItemDto {
  @IsString()
  @MaxLength(200)
  extensionId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  version?: string | null;

  @IsEnum(['allowed', 'blocked'])
  verdict!: 'allowed' | 'blocked';

  @IsOptional()
  @IsEnum(['global', 'course'])
  matchedScope?: 'global' | 'course' | null;

  @IsOptional()
  @IsBoolean()
  isBuiltin?: boolean;
}

export class BatchScanDto {
  @IsString()
  studentMssv!: string;

  @IsString()
  @MaxLength(100)
  machineId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  machineName?: string;

  @IsString()
  scannedAt!: string;

  @IsInt()
  @Min(0)
  extensionCount!: number;

  @IsInt()
  @Min(0)
  violationCount!: number;

  @IsEnum(['clean', 'has_violations'])
  status!: 'clean' | 'has_violations';

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchScanItemDto)
  items!: BatchScanItemDto[];
}

export class BatchMachineDto {
  @IsString()
  @MaxLength(100)
  machineId!: string;

  @IsEnum(['teacher_hub', 'student_node'])
  role!: 'teacher_hub' | 'student_node';

  @IsString()
  @MaxLength(200)
  hostname!: string;

  @IsString()
  @MaxLength(64)
  localIp!: string;

  @IsOptional()
  @IsString()
  studentMssv?: string | null;

  @IsString()
  lastSeenAt!: string;
}

export class BatchSyncDto {
  @IsUUID()
  labMgmtSessionId!: string;

  @IsOptional()
  @IsUUID()
  courseId?: string | null;

  @IsOptional()
  @IsUUID()
  examSessionId?: string | null;

  @IsOptional()
  @IsUUID()
  teacherAccountId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchMachineDto)
  machines?: BatchMachineDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchScanDto)
  scans!: BatchScanDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  effectiveExtensionCount?: number;
}

export class RoomProposalMachineDto {
  @IsString()
  @MaxLength(100)
  machineId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  hostname!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  cpu!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ramGb!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  storage!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  gpu?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  os!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  localIp!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(17)
  macAddress!: string;

  @IsIn(['active', 'maintenance', 'inactive'])
  status!: 'active' | 'maintenance' | 'inactive';

  @IsOptional()
  @IsString()
  studentMssv?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  studentFullName?: string | null;

  @IsEnum(['teacher_hub', 'student_node'])
  role!: 'teacher_hub' | 'student_node';

  @IsOptional()
  @IsString()
  lastSeenAt?: string | null;
}

export class CreateRoomProposalDto {
  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(150)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  building?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  floor?: string | null;

  @IsOptional()
  @IsUUID()
  labMgmtSessionId?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomProposalMachineDto)
  machines!: RoomProposalMachineDto[];
}

export class RejectRoomProposalDto {
  @IsOptional()
  @IsString()
  note?: string | null;
}

export class AcceptCreateRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  building?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  floor?: string | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}
