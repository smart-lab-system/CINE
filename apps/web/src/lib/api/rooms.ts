import { apiClient } from '@/lib/api-client';

// Mirrors RoomEntity (apps/api/src/room/entities/room.entity.ts). Unlike
// courses.ts/accounts.ts, RoomController's response is fully decorated in
// the generated schema (RoomEntity is a real @Entity() class the Swagger
// CLI plugin can introspect) — no `as unknown as` cast needed here.
export interface RoomView {
  id: string;
  name: string;
  capacity: number | null;
}

export async function listRooms(): Promise<RoomView[]> {
  const { data, error, response } = await apiClient.GET('/rooms');
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return data;
}
