'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorSeat } from './seating-editor-utils';
import {
  CreateRowResult,
  DEFAULT_SEAT_SIZE,
  createSeatRow,
  createSeatStar,
  deleteSeatsByIds,
  formatSeatNumber,
  moveSeatsByDelta,
  nextSeatCode,
  rotateSeatsAroundCentroid,
} from './seating-editor-utils';

export type SeatingEditorState = {
  seats: EditorSeat[];
  selectedIds: string[];
  isEditing: boolean;
  rowQty: string;
  rowPrefix: string;
  rowStart: string;
  rowEnd: string;
  rowError: string | null;
};

export type SeatingEditorDerived = {
  selectedSet: Set<string>;
  selectedSeats: EditorSeat[];
  selected: EditorSeat | null;
  hasSelection: boolean;
  deleteLabel: string;
  rowPreview: string | null;
};

export type SeatingEditorActions = {
  setEditing: (value: boolean) => void;
  commitSelection: (ids: string[]) => void;
  updateSeat: (clientId: string, patch: Partial<EditorSeat>) => void;
  addSeat: () => void;
  addRow: () => void;
  addStar: () => void;
  removeSelected: () => void;
  rotateSelected: (delta: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  moveSeats: (ids: string[], dx: number, dy: number) => void;
  onRowQtyChange: (value: string) => void;
  onRowStartChange: (value: string) => void;
  onRowEndChange: (value: string) => void;
  setRowPrefix: (value: string) => void;
};

export type SeatingEditorController = {
  state: SeatingEditorState;
  derived: SeatingEditorDerived;
  actions: SeatingEditorActions;
};

function createRowErrorMessage(
  result: Extract<CreateRowResult, { ok: false }>,
  kind: 'row' | 'star' = 'row',
) {
  switch (result.error) {
    case 'invalid-range':
      return 'Số bắt đầu và số kết thúc không hợp lệ.';
    case 'invalid-quantity':
      return kind === 'star'
        ? 'Số lượng ghế cụm sao phải từ 3 (tam giác) đến 10 (thập giác).'
        : 'Số lượng ghế phải từ 1 đến 80.';
    case 'invalid-code':
      return 'Tiền tố không hợp lệ. Mã ghế chỉ gồm chữ, số, dấu chấm, gạch dưới hoặc gạch ngang (tối đa 32 ký tự).';
    case 'duplicate-codes':
      return `Mã ghế đã tồn tại: ${result.codes?.join(', ')}`;
    default:
      return 'Không tạo được ghế.';
  }
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'SELECT' ||
    tag === 'TEXTAREA' ||
    target.isContentEditable
  );
}

export function useSeatingEditor({
  canvasWidth,
  canvasHeight,
  initialSeats,
}: {
  canvasWidth: number;
  canvasHeight: number;
  initialSeats: EditorSeat[];
}): SeatingEditorController {
  const [seats, setSeats] = useState<EditorSeat[]>(initialSeats);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(true);
  const [rowQty, setRowQty] = useState('10');
  const [rowPrefix, setRowPrefix] = useState('A');
  const [rowStart, setRowStart] = useState('1');
  const [rowEnd, setRowEnd] = useState('10');
  const [rowError, setRowError] = useState<string | null>(null);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  const initialSeatsRef = useRef(initialSeats);
  initialSeatsRef.current = initialSeats;
  const initialSignature = useMemo(
    () =>
      initialSeats
        .map(
          (s) =>
            `${s.clientId}:${s.seatCode}:${s.workstationId}:${s.positionX}:${s.positionY}:${s.rotationDegrees}:${s.isDisabled}:${s.notes}:${s.shape ?? ''}`,
        )
        .join('|'),
    [initialSeats],
  );

  useEffect(() => {
    setSeats(initialSeatsRef.current);
  }, [initialSignature]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedSeats = useMemo(
    () => seats.filter((s) => selectedSet.has(s.clientId)),
    [seats, selectedSet],
  );
  const selected = selectedSeats.length === 1 ? selectedSeats[0] : null;
  const hasSelection = selectedIds.length > 0;
  const deleteLabel =
    selectedIds.length > 1 ? `Xóa ${selectedIds.length} ghế` : 'Xóa ghế';

  const rowPreview = useMemo(() => {
    const start = Number(rowStart);
    const end = Number(rowEnd);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) {
      return null;
    }
    const first = `${rowPrefix.trim()}${formatSeatNumber(start, end)}`;
    const last = `${rowPrefix.trim()}${formatSeatNumber(end, end)}`;
    const count = end - start + 1;
    return count === 1 ? first : `${first} → ${last} (${count} ghế)`;
  }, [rowPrefix, rowStart, rowEnd]);

  function commitSelection(ids: string[]) {
    selectedIdsRef.current = ids;
    setSelectedIds(ids);
  }

  function updateSeat(clientId: string, patch: Partial<EditorSeat>) {
    setSeats((prev) =>
      prev.map((s) => (s.clientId === clientId ? { ...s, ...patch } : s)),
    );
  }

  function addSeat() {
    const current = seatsRef.current;
    const code = nextSeatCode(current);
    const clientId = `new-${Date.now()}`;
    setSeats((prev) => [
      ...prev,
      {
        clientId,
        seatCode: code,
        workstationId: null,
        rowNo: null,
        columnNo: null,
        positionX: 40,
        positionY: 40,
        rotationDegrees: 0,
        isDisabled: false,
        notes: null,
        shape: 'rect',
      },
    ]);
    commitSelection([clientId]);
  }

  function onRowQtyChange(value: string) {
    setRowQty(value);
    const qty = Number(value);
    const start = Number(rowStart);
    if (
      Number.isInteger(qty) &&
      qty >= 1 &&
      Number.isInteger(start) &&
      start >= 0
    ) {
      setRowEnd(String(start + qty - 1));
    }
  }

  function onRowStartChange(value: string) {
    setRowStart(value);
    const start = Number(value);
    const qty = Number(rowQty);
    if (
      Number.isInteger(start) &&
      start >= 0 &&
      Number.isInteger(qty) &&
      qty >= 1
    ) {
      setRowEnd(String(start + qty - 1));
    }
  }

  function onRowEndChange(value: string) {
    setRowEnd(value);
    const end = Number(value);
    const start = Number(rowStart);
    if (Number.isInteger(end) && Number.isInteger(start) && end >= start) {
      setRowQty(String(end - start + 1));
    }
  }

  function applyCreatedSeats(
    result: CreateRowResult,
    kind: 'row' | 'star' = 'row',
  ) {
    if (!result.ok) {
      setRowError(createRowErrorMessage(result, kind));
      return;
    }
    setRowError(null);
    setSeats((prev) => [...prev, ...result.seats]);
    commitSelection(result.seats.map((s) => s.clientId));
  }

  function clusterInput() {
    return {
      prefix: rowPrefix,
      start: Number(rowStart),
      end: Number(rowEnd),
      quantity: Number(rowQty),
      existing: seatsRef.current,
      canvasWidth,
      canvasHeight,
      seatSize: DEFAULT_SEAT_SIZE,
      center: { x: canvasWidth / 2, y: canvasHeight / 2 },
    };
  }

  function addRow() {
    applyCreatedSeats(createSeatRow(clusterInput()));
  }

  function addStar() {
    applyCreatedSeats(createSeatStar(clusterInput()), 'star');
  }

  function removeSelected() {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    setSeats((prev) => deleteSeatsByIds(prev, ids));
    commitSelection([]);
  }

  function rotateSelected(delta: number) {
    const ids = selectedIdsRef.current;
    if (ids.length === 0) return;
    setSeats((prev) =>
      rotateSeatsAroundCentroid(
        prev,
        ids,
        delta,
        canvasWidth,
        canvasHeight,
        DEFAULT_SEAT_SIZE,
      ),
    );
  }

  function selectAll() {
    commitSelection(seatsRef.current.map((s) => s.clientId));
  }

  function clearSelection() {
    commitSelection([]);
  }

  function moveSeats(ids: string[], dx: number, dy: number) {
    setSeats((prev) =>
      moveSeatsByDelta(
        prev,
        ids,
        dx,
        dy,
        canvasWidth,
        canvasHeight,
        DEFAULT_SEAT_SIZE,
      ),
    );
  }

  function setEditing(value: boolean) {
    setIsEditing(value);
    if (!value) {
      setRowError(null);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        commitSelection([]);
        return;
      }
      if (!isEditingRef.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        commitSelection(seatsRef.current.map((s) => s.clientId));
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedIdsRef.current.length === 0) return;
        e.preventDefault();
        setSeats((prev) => deleteSeatsByIds(prev, selectedIdsRef.current));
        commitSelection([]);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    state: {
      seats,
      selectedIds,
      isEditing,
      rowQty,
      rowPrefix,
      rowStart,
      rowEnd,
      rowError,
    },
    derived: {
      selectedSet,
      selectedSeats,
      selected,
      hasSelection,
      deleteLabel,
      rowPreview,
    },
    actions: {
      setEditing,
      commitSelection,
      updateSeat,
      addSeat,
      addRow,
      addStar,
      removeSelected,
      rotateSelected,
      selectAll,
      clearSelection,
      moveSeats,
      onRowQtyChange,
      onRowStartChange,
      onRowEndChange,
      setRowPrefix,
    },
  };
}
