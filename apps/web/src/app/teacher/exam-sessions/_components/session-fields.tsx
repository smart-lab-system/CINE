'use client';

import { CircleAlert } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRooms } from '@/hooks/useRooms';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { EXAM_TYPES } from '../new/schema';

/**
 * Các ô CHUNG của form tạo và form sửa phiên thi (spec §4.1: trang sửa "dùng lại form tạo"). Mỗi ô đọc form qua `useFormContext` — trang dựng
 * `FormProvider` — nên cùng một ô, cùng một câu lỗi, cùng một cách chọn phòng ở cả hai nơi. Kiểu dưới đây chỉ là PHẦN chung; form tạo có thêm
 * lớp, rubric, file bắt buộc, và dùng kiểu rộng hơn.
 */
export interface SessionBasicsValues {
  name: string;
  roomId: string;
  examType: string;
  startTime: string;
  endTime: string;
}

export function SessionNameField() {
  const {
    register,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  return (
    <FormField id="exam-session-name" label="Tên phiên thi" error={errors.name?.message}>
      <Input
        id="exam-session-name"
        placeholder="vd: Thi cuối kỳ Lập trình Web — nhóm 03"
        invalid={Boolean(errors.name)}
        {...register('name')}
      />
    </FormField>
  );
}

/**
 * Phòng CHỌN từ danh sách phòng đang hoạt động (spec §5.2) — không còn gõ chữ. Gõ lệch một ký tự từng làm phép chống trùng lịch phòng mất tác
 * dụng; nay phép đó chạy theo `room_id`, và ô này chỉ cho chọn đúng những phòng admin còn dùng.
 *
 * `keep` là phòng HIỆN TẠI của phiên đang sửa. Nếu admin đã ngừng dùng phòng đó, nó vẫn là một lựa chọn (gắn "đã ngừng hoạt động") và là giá trị
 * đang chọn, để sửa tên hay giờ không buộc phải đổi phòng (T-SES-6); nếu ô không có giá trị hiện tại, Select rơi về "chưa chọn" và một lần sửa
 * tên sẽ âm thầm xoá phòng.
 */
export function SessionRoomField({ keep = null }: { keep?: { id: string; name: string } | null }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  const rooms = useRooms({ activeOnly: true });
  const active = rooms.data ?? [];
  const kept = keep !== null && !active.some((room) => room.id === keep.id) ? keep : null;
  const noRooms = !rooms.isLoading && !rooms.isError && active.length === 0 && kept === null;

  return (
    <FormField
      id="exam-session-room"
      label="Phòng thi"
      hint="Chọn trong danh sách phòng đang hoạt động."
      error={errors.roomId?.message}
    >
      <Controller
        control={control}
        name="roomId"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange} disabled={rooms.isLoading || rooms.isError}>
            <SelectTrigger id="exam-session-room">
              <SelectValue placeholder={rooms.isLoading ? 'Đang tải…' : 'Chọn phòng thi'} />
            </SelectTrigger>
            <SelectContent>
              {kept && <SelectItem value={kept.id}>{kept.name} (đã ngừng hoạt động)</SelectItem>}
              {active.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                  {room.capacity ? ` (${room.capacity} chỗ)` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {rooms.isError && (
        <p role="alert" className="flex items-center gap-1.5 text-small font-medium text-danger-strong">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Không tải được danh sách phòng.
          <button
            type="button"
            onClick={() => rooms.refetch()}
            className="rounded-sm underline underline-offset-2 hover:no-underline"
          >
            Thử lại
          </button>
        </p>
      )}
      {noRooms && (
        <Alert variant="info">
          <AlertDescription>
            Chưa có phòng thi nào đang hoạt động nên chưa tạo được phiên thi. Quản trị viên tạo phòng ở mục Phòng thi.
          </AlertDescription>
        </Alert>
      )}
    </FormField>
  );
}

export function SessionExamTypeField() {
  const {
    control,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  return (
    <FormField id="exam-session-type" label="Loại kỳ thi" error={errors.examType?.message}>
      <Controller
        control={control}
        name="examType"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id="exam-session-type">
              <SelectValue placeholder="Chọn loại kỳ thi" />
            </SelectTrigger>
            <SelectContent>
              {EXAM_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {EXAM_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </FormField>
  );
}

export function SessionTimeFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField id="exam-session-start-time" label="Thời gian bắt đầu" error={errors.startTime?.message}>
        <Input
          id="exam-session-start-time"
          type="datetime-local"
          invalid={Boolean(errors.startTime)}
          {...register('startTime')}
        />
      </FormField>
      <FormField id="exam-session-end-time" label="Thời gian kết thúc" error={errors.endTime?.message}>
        <Input
          id="exam-session-end-time"
          type="datetime-local"
          invalid={Boolean(errors.endTime)}
          {...register('endTime')}
        />
      </FormField>
    </div>
  );
}

/**
 * Học kỳ chỉ để XEM, lấy từ lớp (spec §5.2): không có ô chọn, không gửi lên. Server suy học kỳ từ lớp và chụp chữ vào phiên — chữ đó
 * bảng điểm in ra và không đổi về sau.
 */
export function SessionSemesterReadout({ text }: { text: string }) {
  return (
    <FormField
      id="exam-session-semester"
      label="Học kỳ"
      hint="Lấy từ lớp, không chọn riêng. Chụp vào phiên thi lúc tạo và không đổi về sau — bảng điểm in đúng chữ này."
    >
      <Input id="exam-session-semester" value={text} readOnly aria-readonly="true" />
    </FormField>
  );
}
