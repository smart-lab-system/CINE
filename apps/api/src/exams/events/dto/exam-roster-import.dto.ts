import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExamRosterStudentPreviewDto {
  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;
}

export class ExamRosterImportPreviewDto {
  @ApiProperty()
  storedObjectId!: string;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty({ nullable: true, type: String })
  sectionCodeFromFile!: string | null;

  @ApiProperty({ type: [String] })
  attachedSectionCodes!: string[];

  @ApiProperty({ nullable: true, type: String })
  matchedCourseSectionId!: string | null;

  @ApiProperty()
  sectionCodeMismatch!: boolean;

  @ApiProperty({ type: [ExamRosterStudentPreviewDto] })
  students!: ExamRosterStudentPreviewDto[];
}

export class ApplyExamRosterImportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  confirmSectionMismatch?: boolean;
}

export class ApplyExamRosterImportResponseDto {
  @ApiProperty()
  fileId!: string;

  @ApiProperty()
  courseSectionId!: string;

  @ApiProperty()
  createdStudents!: number;

  @ApiProperty()
  updatedStudents!: number;

  @ApiProperty()
  allowed!: number;

  @ApiProperty()
  removed!: number;
}

export class ExamRosterFileViewDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  courseSectionId!: string;

  @ApiProperty()
  sectionCode!: string;

  @ApiProperty()
  storedObjectId!: string;

  @ApiProperty()
  originalFilename!: string;

  @ApiProperty()
  sizeBytes!: number;

  @ApiProperty({ nullable: true, type: String })
  contentType!: string | null;

  @ApiProperty()
  allowedCount!: number;

  @ApiProperty()
  createdAt!: string;
}

export class ExamRosterFilesListResponseDto {
  @ApiProperty({ type: [ExamRosterFileViewDto] })
  items!: ExamRosterFileViewDto[];

  @ApiProperty()
  total!: number;
}
