'use client';

import { useQuery } from '@tanstack/react-query';
import { listRooms } from '@/lib/api/rooms';

export function useRooms() {
  return useQuery({
    queryKey: ['rooms'],
    queryFn: listRooms,
    staleTime: 5 * 60 * 1000,
  });
}
