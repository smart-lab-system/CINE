import { IsOptional, IsUUID } from 'class-validator';

export class AddParticipantDto {
  @IsUUID()
  studentId!: string;

  @IsUUID()
  courseSectionId!: string;

  @IsOptional()
  @IsUUID()
  seatId?: string;
}
