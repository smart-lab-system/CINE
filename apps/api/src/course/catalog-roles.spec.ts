import { ROLES_KEY } from '../auth/roles.decorator';
import { AdministrativeClassController } from './administrative-class.controller';
import { RoomController } from './room.controller';
import { SemesterController } from './semester.controller';

/**
 * `RolesGuard` trả `true` khi không có metadata, nên một controller mất dòng
 * `@Roles('admin')` ở mức class vẫn biên dịch, vẫn chạy — và mở cho mọi tài
 * khoản đã đăng nhập. Test này ghim dòng đó.
 */
describe('Controller dữ liệu nền khai @Roles("admin") ở mức class', () => {
  it.each([
    ['SemesterController', SemesterController],
    ['RoomController', RoomController],
    ['AdministrativeClassController', AdministrativeClassController],
  ])('%s', (_name, controller) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller)).toEqual(['admin']);
  });

  it('chỉ route đọc của học kỳ và phòng ghi đè cho giảng viên', () => {
    expect(Reflect.getMetadata(ROLES_KEY, SemesterController.prototype.list)).toEqual(['admin', 'teacher']);
    expect(Reflect.getMetadata(ROLES_KEY, RoomController.prototype.list)).toEqual(['admin', 'teacher']);
    for (const handler of [
      SemesterController.prototype.create,
      SemesterController.prototype.update,
      SemesterController.prototype.remove,
      RoomController.prototype.create,
      RoomController.prototype.update,
      RoomController.prototype.remove,
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
    // Danh mục lớp danh nghĩa không có route nào mở cho giảng viên.
    for (const name of ['list', 'create', 'update', 'remove'] as const) {
      expect(Reflect.getMetadata(ROLES_KEY, AdministrativeClassController.prototype[name])).toBeUndefined();
    }
  });
});
