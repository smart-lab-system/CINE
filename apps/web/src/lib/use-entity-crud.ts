'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface EntityListResult<TItem> {
  items: TItem[];
  total: number;
}

export interface UseEntityCrudConfig<TItem extends { id: string }, TCreate, TUpdate> {
  queryKey: string;
  list: (search: string) => Promise<EntityListResult<TItem>>;
  create: (values: TCreate) => Promise<void>;
  update: (id: string, values: TUpdate) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Shared CRUD wiring for the Master Data admin pages — the search input's
 * state, the list query, and the three mutations' `onSuccess` ->
 * `invalidateQueries` plumbing that AccountsPage (Foundation plan) wrote
 * inline once. `list`/`create`/`update`/`remove` stay entity-specific
 * closures owned by each page (they know their own OpenAPI path strings and
 * response-shape casts) — this hook only owns what's identical across all
 * of them. */
export function useEntityCrud<TItem extends { id: string }, TCreate, TUpdate>(
  config: UseEntityCrudConfig<TItem, TCreate, TUpdate>,
) {
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<TItem | null>(null);
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: [config.queryKey, search],
    queryFn: () => config.list(search),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [config.queryKey] });

  const createMutation = useMutation({
    mutationFn: config.create,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TUpdate }) => config.update(id, values),
    onSuccess: () => {
      invalidate();
      setEditingItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: config.remove,
    onSuccess: invalidate,
  });

  return {
    search,
    setSearch,
    data,
    error,
    isLoading,
    editingItem,
    setEditingItem,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
