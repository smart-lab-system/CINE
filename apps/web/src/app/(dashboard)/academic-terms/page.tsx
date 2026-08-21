'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import {
  AcademicTermForm,
  AcademicTermFormValues,
} from '@/components/master-data/academic-term-form';
import {
  EditAcademicTermForm,
  EditAcademicTermFormValues,
} from '@/components/master-data/edit-academic-term-form';
import { Button } from '@/components/ui/button';

interface AcademicTermRow {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

const columnHelper = createColumnHelper<AcademicTermRow>();

export default function AcademicTermsPage() {
  const crud = useEntityCrud<AcademicTermRow, AcademicTermFormValues, EditAcademicTermFormValues>({
    queryKey: 'academic-terms',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/academic-terms', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: AcademicTermRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/academic-terms', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/academic-terms/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/academic-terms/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('code', { header: 'Mã học kỳ' }),
    columnHelper.accessor('name', { header: 'Tên học kỳ' }),
    columnHelper.accessor('startsOn', { header: 'Bắt đầu' }),
    columnHelper.accessor('endsOn', { header: 'Kết thúc' }),
    columnHelper.accessor((row) => (row.isActive ? 'Đang mở' : 'Đã đóng'), {
      header: 'Trạng thái',
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
              if (window.confirm(`Xóa học kỳ "${row.original.name}"?`)) {
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
      title="Quản lý học kỳ"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách học kỳ. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo học kỳ mới"
      editTitle={crud.editingItem ? `Sửa học kỳ — ${crud.editingItem.code}` : null}
      isEditing={crud.editingItem !== null}
      createForm={
        <AcademicTermForm onSubmit={(values) => crud.createMutation.mutate(values)} />
      }
      editForm={
        crud.editingItem && (
          <EditAcademicTermForm
            defaultValues={{
              name: crud.editingItem.name,
              startsOn: crud.editingItem.startsOn,
              endsOn: crud.editingItem.endsOn,
              isActive: crud.editingItem.isActive,
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
