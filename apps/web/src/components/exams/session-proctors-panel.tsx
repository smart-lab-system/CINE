'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mutationErrorMessage, throwOnApiError } from '@/components/exams/exam-api';
import type {
  LecturerOption,
  SessionProctor,
} from '@/components/exams/exam-types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';

const ROLE_LABELS = {
  lead: 'Giám thị trưởng',
  assistant: 'Giám thị phụ',
} as const;

export function SessionProctorsPanel({
  eventId,
  sessionId,
  proctors,
  isDraft,
}: {
  eventId: string;
  sessionId: string;
  proctors: SessionProctor[];
  isDraft: boolean;
}) {
  const queryClient = useQueryClient();
  const [lecturerId, setLecturerId] = useState('');
  const [role, setRole] = useState<'lead' | 'assistant'>('lead');
  const hasLead = proctors.some((p) => p.role === 'lead');

  useEffect(() => {
    if (hasLead && role === 'lead') setRole('assistant');
  }, [hasLead, role]);

  const lecturersQuery = useQuery({
    queryKey: ['lecturers', 'for-exam-proctors'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/lecturers', {
        params: { query: { page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) throw error ?? new Error('lecturers failed');
      return data as unknown as { items: LecturerOption[] };
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      await throwOnApiError(
        await apiClient.POST(
          '/exam-events/{id}/sessions/{sessionId}/proctors',
          {
            params: { path: { id: eventId, sessionId } },
            body: { lecturerId, role },
          },
        ),
      );
    },
    onSuccess: () => {
      setLecturerId('');
      queryClient.invalidateQueries({
        queryKey: ['exam-events', eventId],
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (proctorId: string) => {
      throwOnApiError(
        await apiClient.DELETE(
          '/exam-events/{id}/sessions/{sessionId}/proctors/{proctorId}',
          { params: { path: { id: eventId, sessionId, proctorId } } },
        ),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['exam-events', eventId] }),
  });

  const assignedIds = new Set(proctors.map((p) => p.lecturerId));
  const available = (lecturersQuery.data?.items ?? []).filter(
    (lecturer) => !assignedIds.has(lecturer.id),
  );
  const nameFor = (lecturerId: string) => {
    const lecturer = lecturersQuery.data?.items.find(
      (item) => item.id === lecturerId,
    );
    return lecturer
      ? `${lecturer.employeeCode} — ${lecturer.fullName}`
      : lecturerId;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Giám thị</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vai trò</TableHead>
              <TableHead>Giảng viên</TableHead>
              {isDraft ? <TableHead>Thao tác</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {proctors.length === 0 ? (
              <TableRow>
                <TableCell className="text-sm text-muted-foreground">
                  Chưa có giám thị. Công bố cần giám thị trưởng (có tài khoản
                  active).
                </TableCell>
                <TableCell />
                {isDraft ? <TableCell /> : null}
              </TableRow>
            ) : (
              proctors.map((proctor) => (
                <TableRow key={proctor.id}>
                  <TableCell>{ROLE_LABELS[proctor.role]}</TableCell>
                  <TableCell>{nameFor(proctor.lecturerId)}</TableCell>
                  {isDraft ? (
                    <TableCell>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (window.confirm('Gỡ giám thị này?')) {
                            removeMutation.mutate(proctor.id);
                          }
                        }}
                      >
                        Gỡ
                      </Button>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {isDraft ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (lecturerId) addMutation.mutate();
            }}
          >
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <Label htmlFor="exam-proctor">Giảng viên</Label>
              <Select
                id="exam-proctor"
                value={lecturerId}
                onChange={(e) => setLecturerId(e.target.value)}
              >
                <option value="">— Chọn giảng viên —</option>
                {available.map((lecturer) => (
                  <option key={lecturer.id} value={lecturer.id}>
                    {lecturer.employeeCode} — {lecturer.fullName}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-proctor-role">Vai trò</Label>
              <Select
                id="exam-proctor-role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'lead' | 'assistant')
                }
              >
                <option value="lead" disabled={hasLead}>
                  Giám thị trưởng
                </option>
                <option value="assistant">Giám thị phụ</option>
              </Select>
            </div>
            <Button type="submit" disabled={!lecturerId}>
              Gán
            </Button>
          </form>
        ) : null}

        {addMutation.error || removeMutation.error ? (
          <p role="alert" className="text-sm text-destructive">
            {mutationErrorMessage(
              addMutation.error ?? removeMutation.error,
              'Không cập nhật được giám thị.',
            )}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
