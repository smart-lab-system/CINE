import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

// Phản chiếu RoomView (plan C). `sessionCount` chỉ có với admin.
export interface Room {
  id: string;
  name: string;
  capacity: number | null;
  /** `false` = ngừng hoạt động: không chọn được cho phiên MỚI, phiên cũ vẫn tham chiếu được. */
  isActive: boolean;
  sessionCount?: number;
}

export interface RoomInput {
  name: string;
  /** Không bắt buộc: chưa biết sức chứa không được chặn việc ghi nhận phòng. */
  capacity?: number;
  /** Admin đã thấy cảnh báo "gần giống" và vẫn muốn thêm. */
  confirmSimilar?: boolean;
}

export interface RoomUpdate {
  name?: string;
  /** `null` xoá sức chứa. */
  capacity?: number | null;
  isActive?: boolean;
  confirmSimilar?: boolean;
}

/** `activeOnly` cho form tạo/sửa phiên thi: chỉ những phòng chọn được. */
export async function listRooms(options: { activeOnly?: boolean } = {}): Promise<Room[]> {
  const { data, error, response } = await apiClient.GET('/rooms', {
    params: { query: options.activeOnly ? { active: 'true' } : {} },
  });
  await throwIfFailed(error, response);
  return data as unknown as Room[];
}

export async function createRoom(body: RoomInput): Promise<Room> {
  const { data, error, response } = await apiClient.POST('/rooms', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as Room;
}

export async function updateRoom(id: string, body: RoomUpdate): Promise<Room> {
  const { data, error, response } = await apiClient.PATCH('/rooms/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as Room;
}

/** Phòng đã có phiên thi thì server từ chối và bảo tắt hoạt động thay vì xoá. */
export async function deleteRoom(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/rooms/{id}', { params: { path: { id } } });
  await throwIfFailed(error, response);
}
