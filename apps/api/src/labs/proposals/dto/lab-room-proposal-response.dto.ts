import { ApiProperty } from '@nestjs/swagger';

export class LabRoomProposalDeviceViewDto {
  @ApiProperty({ enum: ['tutor', 'client'] })
  role!: 'tutor' | 'client';

  @ApiProperty()
  machineId!: string;

  @ApiProperty()
  hostname!: string;

  @ApiProperty()
  macAddress!: string;

  @ApiProperty()
  osEdition!: string;

  @ApiProperty()
  osVersion!: string;

  @ApiProperty()
  serial!: string;

  @ApiProperty({ required: false })
  ipv4?: string;

  @ApiProperty({ required: false })
  username?: string;
}

export class LabRoomProposalViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  roomCode!: string;

  @ApiProperty()
  roomName!: string;

  @ApiProperty({ nullable: true, type: String })
  building!: string | null;

  @ApiProperty({ nullable: true, type: String })
  floor!: string | null;

  @ApiProperty({ type: [LabRoomProposalDeviceViewDto] })
  devices!: LabRoomProposalDeviceViewDto[];

  @ApiProperty({ nullable: true, type: String })
  submittedBy!: string | null;

  @ApiProperty({ nullable: true, type: String })
  submittedByName!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class LabRoomProposalsListResponseDto {
  @ApiProperty({ type: [LabRoomProposalViewDto] })
  items!: LabRoomProposalViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateLabRoomProposalResponseDto {
  @ApiProperty()
  id!: string;
}

export class CreateLabFromProposalResponseDto {
  @ApiProperty()
  labId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  workstationCount!: number;
}
