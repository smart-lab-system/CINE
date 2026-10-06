import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateAdministrativeClassDto {
  /** Chưa chuẩn hoá: service viết hoa, cắt khoảng trắng rồi kiểm 3–30 ký tự chữ/số. */
  @IsString()
  code!: string;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class UpdateAdministrativeClassDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}
