'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import { SubjectForm, SubjectFormValues } from '@/components/master-data/subject-form';
import {
  EditSubjectForm,
  EditSubjectFormValues,
} from '@/components/master-data/edit-subject-form';
import { Button } from '@/components/ui/button';

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  credits: number | null;
  description: string | null;
}

const columnHelper = createColumnHelper<SubjectRow>();

export default function SubjectsPage() {
  const crud = useEntityCrud<SubjectRow, SubjectFormValues, EditSubjectFormValues>({
    queryKey: 'subjects',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: SubjectRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/subjects', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/subjects/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/subjects/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('code', { header: 'Mã môn học' }),
    columnHelper.accessor('name', { header: 'Tên môn học' }),
    columnHelper.accessor('credits', {
      header: 'Số tín chỉ',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => crud.setEditingItem(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa môn học "${row.original.name}"?`)) {
                crud.deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <EntityCrudScaffold
      title="Quản lý môn học"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách môn học. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo môn học mới"
      editTitle={crud.editingItem ? `Sửa môn học — ${crud.editingItem.code}` : null}
      isEditing={crud.editingItem !== null}
      createForm={<SubjectForm onSubmit={(values) => crud.createMutation.mutate(values)} />}
      editForm={
        crud.editingItem && (
          <EditSubjectForm
            defaultValues={{
              name: crud.editingItem.name,
              credits: crud.editingItem.credits ?? undefined,
              description: crud.editingItem.description ?? undefined,
            }}
            onSubmit={(values) =>
              crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
            }
            onCancel={() => crud.setEditingItem(null)}
          />
        )
      }
    />
  );
}
