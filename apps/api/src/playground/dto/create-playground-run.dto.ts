import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PLAYGROUND_LANGUAGES, PLAYGROUND_SOURCE_MAX_CHARS } from '../playground.constants';

export class CreatePlaygroundRunDto {
  @ApiProperty({
    enum: PLAYGROUND_LANGUAGES,
    description: 'console: c|cpp|java|python — web: static|spring-boot|vite-react|express',
  })
  @IsIn([...PLAYGROUND_LANGUAGES])
  language!: (typeof PLAYGROUND_LANGUAGES)[number];

  @ApiPropertyOptional({ description: 'Dán source (một file). Bỏ trống nếu upload multipart.' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PLAYGROUND_SOURCE_MAX_CHARS)
  source?: string;
}

export class ExecutePlaygroundRunDto {
  @ApiPropertyOptional({
    description: 'Bắt buộc khi entryDetection=pending / status=needs_entry',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  entryPath?: string;
}
