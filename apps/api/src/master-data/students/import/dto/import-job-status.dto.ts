import { ApiProperty } from '@nestjs/swagger';

export class ImportRowErrorDto {
  @ApiProperty()
  row!: number;

  @ApiProperty({ nullable: true, type: String })
  studentCode!: string | null;

  @ApiProperty()
  message!: string;
}

export class ImportResultDto {
  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty({ type: [ImportRowErrorDto] })
  errors!: ImportRowErrorDto[];
}

export class ImportJobStatusDto {
  @ApiProperty()
  jobId!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty({ nullable: true, type: ImportResultDto })
  result!: ImportResultDto | null;

  @ApiProperty({ nullable: true, type: String })
  failedReason!: string | null;
}
