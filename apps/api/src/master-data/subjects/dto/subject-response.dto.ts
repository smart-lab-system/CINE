import { ApiProperty } from '@nestjs/swagger';

export class SubjectViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: Number })
  credits!: number | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;
}

export class SubjectsListResponseDto {
  @ApiProperty({ type: [SubjectViewDto] })
  items!: SubjectViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateSubjectResponseDto {
  @ApiProperty()
  id!: string;
}
