import { ApiProperty } from '@nestjs/swagger';

export class CreateStoredObjectResponseDto {
  @ApiProperty()
  id!: string;
}
