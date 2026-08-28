import { ApiProperty } from '@nestjs/swagger';

export class CourseSectionViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  subjectCode!: string;

  @ApiProperty()
  subjectName!: string;

  @ApiProperty()
  academicTermId!: string;

  @ApiProperty()
  termCode!: string;

  @ApiProperty()
  termName!: string;

  @ApiProperty()
  sectionCode!: string;

  @ApiProperty({ nullable: true, type: String })
  nominalClassCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lecturerId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lecturerCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lecturerName!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  maxEnrollment!: number | null;
}

export class CourseSectionsListResponseDto {
  @ApiProperty({ type: [CourseSectionViewDto] })
  items!: CourseSectionViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateCourseSectionResponseDto {
  @ApiProperty()
  id!: string;
}

export class EnrollmentViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  courseSectionId!: string;

  @ApiProperty()
  studentId!: string;

  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: ['active', 'dropped', 'withdrawn'] })
  status!: 'active' | 'dropped' | 'withdrawn';

  @ApiProperty()
  enrolledAt!: string;
}

export class EnrollmentsListResponseDto {
  @ApiProperty({ type: [EnrollmentViewDto] })
  items!: EnrollmentViewDto[];

  @ApiProperty()
  total!: number;
}

export class CreateEnrollmentResponseDto {
  @ApiProperty()
  id!: string;
}

export class BulkEnrollResponseDto {
  @ApiProperty({ type: [String] })
  ids!: string[];
}
