import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class BulkAddParticipantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  studentIds!: string[];

  @IsUUID()
  courseSectionId!: string;
}
