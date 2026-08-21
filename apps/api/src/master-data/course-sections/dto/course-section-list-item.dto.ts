import { ApiProperty } from '@nestjs/swagger';

export class CourseSectionSubjectRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class CourseSectionTermRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class CourseSectionListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sectionCode!: string;

  @ApiProperty({ nullable: true, type: String })
  nominalClassCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ type: CourseSectionSubjectRefDto })
  subject!: CourseSectionSubjectRefDto;

  @ApiProperty({ type: CourseSectionTermRefDto })
  academicTerm!: CourseSectionTermRefDto;
}

export class PaginatedCourseSectionsDto {
  @ApiProperty({ type: [CourseSectionListItemDto] })
  items!: CourseSectionListItemDto[];

  @ApiProperty()
  total!: number;
}
