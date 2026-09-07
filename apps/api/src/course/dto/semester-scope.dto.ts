import { IsOptional, IsUUID } from 'class-validator';

/**
 * Bộ lọc học kỳ dùng chung cho các danh sách học vụ.
 *
 * LỌC, không phải PHẠM VI. Service AND nó vào điều kiện sở hữu sẵn có và không
 * bao giờ thay thế — xem spec §5.1 và `semester-filter.e2e-spec.ts`.
 */
export class SemesterScopeDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;
}
