import { IsUUID } from 'class-validator';

export class AttachSectionDto {
  @IsUUID()
  courseSectionId!: string;
}
