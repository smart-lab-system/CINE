import { ApiProperty } from '@nestjs/swagger';

export class WorkstationViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  labId!: string;

  @ApiProperty()
  agentId!: string;

  @ApiProperty()
  assetCode!: string;

  @ApiProperty()
  hostname!: string;

  @ApiProperty({ nullable: true, type: String })
  macAddress!: string | null;

  @ApiProperty({ nullable: true, type: String })
  staticIpAddress!: string | null;

  @ApiProperty({ nullable: true, type: String })
  serialNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  operatingSystem!: string | null;

  @ApiProperty()
  isEnabled!: boolean;

  @ApiProperty({
    enum: ['master', 'client'],
    default: 'client',
  })
  type!: 'master' | 'client';

  @ApiProperty({
    enum: ['available', 'maintenance', 'broken', 'retired'],
  })
  status!: 'available' | 'maintenance' | 'broken' | 'retired';

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;
}

export class WorkstationsListResponseDto {
  @ApiProperty({ type: [WorkstationViewDto] })
  items!: WorkstationViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateWorkstationResponseDto {
  @ApiProperty()
  id!: string;
}
