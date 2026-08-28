import { IsIn, IsUUID } from 'class-validator';
import {
  PROCTOR_ROLES,
  ProctorRole,
} from '../../entities/session-proctor.entity';

export class AssignProctorDto {
  @IsUUID()
  lecturerId!: string;

  @IsIn(PROCTOR_ROLES)
  role!: ProctorRole;
}
