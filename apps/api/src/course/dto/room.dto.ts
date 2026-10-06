import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRoomDto {
  /** Tên chưa chuẩn hoá — service cắt và gộp khoảng trắng rồi kiểm độ dài. */
  @IsString()
  name!: string;

  /** Chưa biết sức chứa không được chặn việc ghi nhận phòng. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;

  /** Admin đã thấy cảnh báo "gần giống" và vẫn muốn thêm. */
  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  name?: string;

  /** `null` xoá sức chứa. `@IsOptional` bỏ qua cả `null` lẫn `undefined`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ListRoomsDto {
  /** `?active=true` cho form tạo phiên. Vắng mặt là cả phòng đã ngừng (trang quản trị). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['true', 'false'])
  active?: 'true' | 'false';
}
