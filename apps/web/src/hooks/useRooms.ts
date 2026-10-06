'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRoom,
  deleteRoom,
  listRooms,
  updateRoom,
  type RoomInput,
  type RoomUpdate,
} from '@/lib/api/rooms';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Phòng. `activeOnly` cho form tạo/sửa phiên thi (chỉ phòng chọn được); trang quản trị đọc cả phòng đã ngừng. Hai chế độ có hai
 * khoá riêng để cache của một chế độ không bao giờ trả lời cho chế độ kia.
 */
export function useRooms(options: { activeOnly?: boolean } = {}) {
  const activeOnly = options.activeOnly === true;
  return useQuery({
    queryKey: [MASTER_DATA_KEYS.rooms, { activeOnly }],
    queryFn: () => listRooms(options),
    staleTime: 60 * 1000,
  });
}

function useRoomMutation<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MASTER_DATA_KEYS.rooms] }),
  });
}

export function useCreateRoom() {
  return useRoomMutation((body: RoomInput) => createRoom(body));
}

export function useUpdateRoom() {
  return useRoomMutation((args: { id: string; body: RoomUpdate }) => updateRoom(args.id, args.body));
}

export function useDeleteRoom() {
  return useRoomMutation((id: string) => deleteRoom(id));
}
