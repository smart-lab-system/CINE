'use client';

import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import { StudentForm, StudentFormValues } from '@/components/master-data/student-form';
import {
  EditStudentForm,
  EditStudentFormValues,
} from '@/components/master-data/edit-student-form';
import { Button } from '@/components/ui/button';

interface StudentRow {
  id: string;
  studentCode: string;
  fullName: string;
  dateOfBirth: string | null;
  classCode: string | null;
  cohortYear: number | null;
}

const columnHelper = createColumnHelper<StudentRow>();

export default function StudentsPage() {
  const crud = useEntityCrud<StudentRow, StudentFormValues, EditStudentFormValues>({
    queryKey: 'students',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/students', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: StudentRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/students', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/students/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/students/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('studentCode', { header: 'Mã số sinh viên' }),
    columnHelper.accessor('fullName', { header: 'Họ tên' }),
    columnHelper.accessor('classCode', {
      header: 'Lớp',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('cohortYear', {
      header: 'Năm nhập học',
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
              if (window.confirm(`Xóa sinh viên "${row.original.fullName}"?`)) {
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
    <>
      <div className="mx-auto w-full max-w-4xl px-8 pt-8">
        <Link href="/students/import" className="text-sm underline">
          Nhập từ Excel
        </Link>
      </div>
      <EntityCrudScaffold
        title="Quản lý sinh viên"
        searchPlaceholder="Tìm kiếm..."
        search={crud.search}
        onSearchChange={crud.setSearch}
        columns={columns}
        items={crud.data?.items ?? []}
        isLoading={crud.isLoading}
        error={crud.error}
        errorMessage="Không tải được danh sách sinh viên. Hãy tải lại trang hoặc đăng nhập lại."
        createTitle="Tạo sinh viên mới"
        editTitle={crud.editingItem ? `Sửa sinh viên — ${crud.editingItem.studentCode}` : null}
        isEditing={crud.editingItem !== null}
        createForm={<StudentForm onSubmit={(values) => crud.createMutation.mutate(values)} />}
        editForm={
          crud.editingItem && (
            <EditStudentForm
              defaultValues={{
                fullName: crud.editingItem.fullName,
                dateOfBirth: crud.editingItem.dateOfBirth ?? undefined,
                classCode: crud.editingItem.classCode ?? undefined,
                cohortYear: crud.editingItem.cohortYear ?? undefined,
              }}
              onSubmit={(values) =>
                crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
              }
              onCancel={() => crud.setEditingItem(null)}
            />
          )
        }
      />
    </>
  );
}
