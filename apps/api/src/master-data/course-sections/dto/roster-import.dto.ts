import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RosterStudentPreviewDto {
  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;
}

export class RosterImportPreviewDto {
  @ApiProperty()
  storedObjectId!: string;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty({ nullable: true, type: String })
  sectionCodeFromFile!: string | null;

  @ApiProperty()
  sectionCodeMismatch!: boolean;

  @ApiProperty({ type: [RosterStudentPreviewDto] })
  students!: RosterStudentPreviewDto[];
}

export class ApplyRosterImportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  confirmSectionMismatch?: boolean;
}

export class ApplyRosterImportResponseDto {
  @ApiProperty()
  fileId!: string;

  @ApiProperty()
  createdStudents!: number;

  @ApiProperty()
  updatedStudents!: number;

  @ApiProperty()
  enrolled!: number;

  @ApiProperty()
  unenrolled!: number;
}

export class CourseSectionFileViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  storedObjectId!: string;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ nullable: true, type: String })
  contentType!: string | null;

  @ApiProperty()
  createdAt!: string;
}

export class CourseSectionFilesListResponseDto {
  @ApiProperty({ type: [CourseSectionFileViewDto] })
  items!: CourseSectionFileViewDto[];

  @ApiProperty()
  total!: number;
}
