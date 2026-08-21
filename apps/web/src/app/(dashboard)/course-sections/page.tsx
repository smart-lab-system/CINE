'use client';

import { createColumnHelper } from '@tanstack/react-table';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import {
  CourseSectionForm,
  CourseSectionFormValues,
} from '@/components/master-data/course-section-form';
import {
  EditCourseSectionForm,
  EditCourseSectionFormValues,
} from '@/components/master-data/edit-course-section-form';
import { Button } from '@/components/ui/button';

interface CourseSectionRow {
  id: string;
  sectionCode: string;
  nominalClassCode: string | null;
  name: string | null;
  subject: { id: string; code: string; name: string };
  academicTerm: { id: string; code: string; name: string };
}

const columnHelper = createColumnHelper<CourseSectionRow>();

export default function CourseSectionsPage() {
  const crud = useEntityCrud<
    CourseSectionRow,
    CourseSectionFormValues,
    EditCourseSectionFormValues
  >({
    queryKey: 'course-sections',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/course-sections', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: CourseSectionRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/course-sections', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/course-sections/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/course-sections/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('sectionCode', { header: 'Mã lớp học phần' }),
    columnHelper.accessor((row) => `${row.subject.code} — ${row.subject.name}`, {
      header: 'Môn học',
      id: 'subject',
    }),
    columnHelper.accessor((row) => `${row.academicTerm.code} — ${row.academicTerm.name}`, {
      header: 'Học kỳ',
      id: 'term',
    }),
    columnHelper.accessor('nominalClassCode', {
      header: 'Lớp danh nghĩa',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/course-sections/${row.original.id}/enrollments`}
            className="text-sm underline"
          >
            Sinh viên
          </Link>
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
              if (window.confirm(`Xóa lớp học phần "${row.original.sectionCode}"?`)) {
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
      title="Quản lý lớp học phần"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách lớp học phần. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo lớp học phần mới"
      editTitle={crud.editingItem ? `Sửa lớp học phần — ${crud.editingItem.sectionCode}` : null}
      isEditing={crud.editingItem !== null}
      createForm={
        <CourseSectionForm onSubmit={(values) => crud.createMutation.mutate(values)} />
      }
      editForm={
        crud.editingItem && (
          <EditCourseSectionForm
            defaultValues={{
              nominalClassCode: crud.editingItem.nominalClassCode ?? undefined,
              name: crud.editingItem.name ?? undefined,
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
