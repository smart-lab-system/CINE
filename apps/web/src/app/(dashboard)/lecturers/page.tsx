'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import { LecturerForm, LecturerFormValues } from '@/components/master-data/lecturer-form';
import {
  EditLecturerForm,
  EditLecturerFormValues,
} from '@/components/master-data/edit-lecturer-form';
import { Button } from '@/components/ui/button';

interface LecturerRow {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string | null;
  academicTitle: string | null;
}

const columnHelper = createColumnHelper<LecturerRow>();

export default function LecturersPage() {
  const crud = useEntityCrud<LecturerRow, LecturerFormValues, EditLecturerFormValues>({
    queryKey: 'lecturers',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/lecturers', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: LecturerRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/lecturers', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/lecturers/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/lecturers/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('employeeCode', { header: 'Mã giảng viên' }),
    columnHelper.accessor('fullName', { header: 'Họ tên' }),
    columnHelper.accessor('department', {
      header: 'Khoa / Bộ môn',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('academicTitle', {
      header: 'Học vị / Học hàm',
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
              if (window.confirm(`Xóa giảng viên "${row.original.fullName}"?`)) {
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
      title="Quản lý giảng viên"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách giảng viên. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo giảng viên mới"
      editTitle={crud.editingItem ? `Sửa giảng viên — ${crud.editingItem.employeeCode}` : null}
      isEditing={crud.editingItem !== null}
      createForm={<LecturerForm onSubmit={(values) => crud.createMutation.mutate(values)} />}
      editForm={
        crud.editingItem && (
          <EditLecturerForm
            defaultValues={{
              fullName: crud.editingItem.fullName,
              department: crud.editingItem.department ?? undefined,
              academicTitle: crud.editingItem.academicTitle ?? undefined,
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
