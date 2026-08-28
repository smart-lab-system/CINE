'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Konva from 'konva';
import { Stage, Layer, Rect, Text, Group, Circle, RegularPolygon } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
  DEFAULT_SEAT_SIZE,
  EditorSeat,
  clientIdsInRect,
  clampGroupDelta,
  normalizeRect,
  seatCenterOriginTransform,
  toggleId,
  unionIds,
} from './seating-editor-utils';
import { SeatingLegend } from './seating-legend';
import {
  assignedWorkstationHostname,
  type WorkstationOption,
} from './seating-types';

const MARQUEE_CLICK_PX = 4;
const SEAT_DRAG_DISTANCE_PX = 6;

type MarqueeRect = { x: number; y: number; width: number; height: number };
type SeatHoverTip = { hostname: string; x: number; y: number };

function seatAppearance(
  seat: EditorSeat,
  isSelected: boolean,
  ws: WorkstationOption | undefined,
) {
  const isMaster = ws?.type === 'master';
  const isClient = ws?.type === 'client';

  let fillColor = isSelected ? '#0f172a' : '#334155';
  let strokeColor = isSelected ? '#38bdf8' : '#94a3b8';
  let strokeWidth = isSelected ? 3 : 1;
  let badgeText: string | null = null;
  let badgeBg = '#475569';

  if (seat.isDisabled) {
    fillColor = '#94a3b8';
    strokeColor = isSelected ? '#38bdf8' : '#64748b';
    strokeWidth = isSelected ? 3 : 1;
  } else if (isMaster) {
    fillColor = isSelected ? '#581c87' : '#7e22ce';
    strokeColor = isSelected ? '#facc15' : '#c084fc';
    strokeWidth = isSelected ? 3 : 2;
    badgeText = 'GV';
    badgeBg = '#581c87';
  } else if (isClient) {
    fillColor = isSelected ? '#0369a1' : '#0284c7';
    strokeColor = isSelected ? '#facc15' : '#7dd3fc';
    strokeWidth = isSelected ? 3 : 1.5;
    badgeText = 'SV';
    badgeBg = '#0369a1';
  }

  return { fillColor, strokeColor, strokeWidth, badgeText, badgeBg };
}

export function SeatingCanvas({
  canvasWidth,
  canvasHeight,
  seats,
  selectedIds,
  workstations,
  editable,
  onSelectionChange,
  onMoveSeats,
  onSeatDblClick,
  showLegend = true,
}: {
  canvasWidth: number;
  canvasHeight: number;
  seats: EditorSeat[];
  selectedIds: string[];
  workstations: WorkstationOption[];
  editable: boolean;
  onSelectionChange: (ids: string[]) => void;
  onMoveSeats: (ids: string[], dx: number, dy: number) => void;
  onSeatDblClick?: (clientId: string) => void;
  showLegend?: boolean;
}) {
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [isMarqueeing, setIsMarqueeing] = useState(false);
  const [hoverTip, setHoverTip] = useState<SeatHoverTip | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const seatsRef = useRef(seats);
  seatsRef.current = seats;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onMoveSeatsRef = useRef(onMoveSeats);
  onMoveSeatsRef.current = onMoveSeats;
  const onSeatDblClickRef = useRef(onSeatDblClick);
  onSeatDblClickRef.current = onSeatDblClick;
  const marqueeRef = useRef(marquee);
  marqueeRef.current = marquee;
  const marqueeStartRef = useRef<{
    x: number;
    y: number;
    additive: boolean;
  } | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const seatNodesRef = useRef(new Map<string, Konva.Group>());
  const dragOriginRef = useRef<{
    id: string;
    x: number;
    y: number;
    members: { id: string; positionX: number; positionY: number }[];
  } | null>(null);
  const suppressClickRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const wsMap = useMemo(
    () => new Map(workstations.map((w) => [w.id, w])),
    [workstations],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const availableWidth =
    viewportWidth > 0 ? Math.max(viewportWidth - 24, 320) : 1120;
  const scale = Math.min(1, availableWidth / canvasWidth);

  function selectIds(ids: string[]) {
    selectedIdsRef.current = ids;
    onSelectionChangeRef.current(ids);
  }

  function eventClientPoint(e: MouseEvent | TouchEvent) {
    if ('changedTouches' in e && e.changedTouches[0]) {
      return {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY,
      };
    }
    if ('touches' in e && e.touches[0]) {
      return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if ('clientX' in e) {
      return { x: e.clientX, y: e.clientY };
    }
    return null;
  }

  useEffect(() => {
    if (!isMarqueeing || !editable) return;

    function canvasPoint(e: MouseEvent | TouchEvent) {
      const stage = stageRef.current;
      const client = eventClientPoint(e);
      if (!stage || !client) return null;
      const bounds = stage.container().getBoundingClientRect();
      return {
        x: (client.x - bounds.left) / scale,
        y: (client.y - bounds.top) / scale,
      };
    }

    function onMove(e: MouseEvent | TouchEvent) {
      if ('preventDefault' in e && e.cancelable && 'touches' in e) {
        e.preventDefault();
      }
      const start = marqueeStartRef.current;
      const pos = canvasPoint(e);
      if (!start || !pos) return;
      const rect = normalizeRect(start.x, start.y, pos.x, pos.y);
      marqueeRef.current = rect;
      setMarquee(rect);
    }

    function onUp(e: MouseEvent | TouchEvent) {
      const start = marqueeStartRef.current;
      const pos = canvasPoint(e);
      if (start && pos) {
        marqueeRef.current = normalizeRect(start.x, start.y, pos.x, pos.y);
      }
      const rect = marqueeRef.current;
      marqueeStartRef.current = null;
      setMarquee(null);
      setIsMarqueeing(false);
      if (!start || !rect) return;
      if (rect.width < MARQUEE_CLICK_PX && rect.height < MARQUEE_CLICK_PX) {
        if (!start.additive) {
          selectIds([]);
        }
        return;
      }
      const ids = clientIdsInRect(
        seatsRef.current,
        rect,
        DEFAULT_SEAT_SIZE,
      );
      selectIds(start.additive ? unionIds(selectedIdsRef.current, ids) : ids);
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [isMarqueeing, scale, editable]);

  function onBgPointerDown(e: KonvaEventObject<MouseEvent | TouchEvent>) {
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const evt = e.evt;
    if ('button' in evt && evt.button !== 0) return;
    if (!editable) {
      selectIds([]);
      return;
    }
    const additive = Boolean(
      'ctrlKey' in evt && (evt.ctrlKey || evt.metaKey || evt.shiftKey),
    );
    marqueeStartRef.current = { x: pos.x, y: pos.y, additive };
    const rect = { x: pos.x, y: pos.y, width: 0, height: 0 };
    marqueeRef.current = rect;
    setMarquee(rect);
    setIsMarqueeing(true);
    setHoverTip(null);
  }

  function onSeatMouseDown(
    seat: EditorSeat,
    e: KonvaEventObject<MouseEvent | TouchEvent>,
  ) {
    e.cancelBubble = true;
    const evt = e.evt as MouseEvent;
    const id = seat.clientId;
    const current = selectedIdsRef.current;
    if (!editable) {
      selectIds([id]);
      return;
    }
    if (evt.ctrlKey || evt.metaKey) {
      selectIds(toggleId(current, id));
    } else if (evt.shiftKey) {
      selectIds(current.includes(id) ? current : [...current, id]);
    } else if (!current.includes(id)) {
      selectIds([id]);
    }
  }

  function onSeatClick(
    seat: EditorSeat,
    e: KonvaEventObject<MouseEvent | TouchEvent>,
  ) {
    e.cancelBubble = true;
    if (suppressClickRef.current) return;
    const evt = e.evt as MouseEvent;
    if (evt.ctrlKey || evt.metaKey || evt.shiftKey) return;
    selectIds([seat.clientId]);
  }

  function hoverPosition(e: KonvaEventObject<MouseEvent>) {
    const stage = e.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) return null;
    return { x: pointer.x, y: pointer.y };
  }

  function showSeatHover(seat: EditorSeat, e: KonvaEventObject<MouseEvent>) {
    if (isMarqueeing || dragOriginRef.current) {
      setHoverTip(null);
      return;
    }
    const hostname = assignedWorkstationHostname(
      seat.workstationId,
      seat.workstationId ? wsMap.get(seat.workstationId)?.hostname : undefined,
    );
    const pos = hoverPosition(e);
    if (!hostname || !pos) {
      setHoverTip(null);
      return;
    }
    setHoverTip({ hostname, x: pos.x, y: pos.y });
  }

  function openSeatProperties(
    seat: EditorSeat,
    e: KonvaEventObject<MouseEvent | TouchEvent>,
  ) {
    e.cancelBubble = true;
    if (suppressClickRef.current) return;
    setHoverTip(null);
    selectIds([seat.clientId]);
    onSeatDblClickRef.current?.(seat.clientId);
  }

  function onSeatDragStart(clientId: string, e: KonvaEventObject<DragEvent>) {
    suppressClickRef.current = true;
    setHoverTip(null);
    const ids = selectedIdsRef.current.includes(clientId)
      ? selectedIdsRef.current
      : [clientId];
    const idSet = new Set(ids);
    dragOriginRef.current = {
      id: clientId,
      x: e.target.x(),
      y: e.target.y(),
      members: seatsRef.current
        .filter((s) => idSet.has(s.clientId))
        .map((s) => ({
          id: s.clientId,
          positionX: s.positionX,
          positionY: s.positionY,
        })),
    };
  }

  function onSeatDragMove(e: KonvaEventObject<DragEvent>) {
    const origin = dragOriginRef.current;
    if (!origin) return;
    const dx = e.target.x() - origin.x;
    const dy = e.target.y() - origin.y;
    for (const member of origin.members) {
      if (member.id === origin.id) continue;
      const transform = seatCenterOriginTransform(
        member.positionX + dx,
        member.positionY + dy,
      );
      seatNodesRef.current.get(member.id)?.position({
        x: transform.x,
        y: transform.y,
      });
    }
  }

  function onSeatDragEnd(e: KonvaEventObject<DragEvent>) {
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    if (!origin) return;
    const dx = e.target.x() - origin.x;
    const dy = e.target.y() - origin.y;
    onMoveSeatsRef.current(
      origin.members.map((m) => m.id),
      dx,
      dy,
    );
  }

  function seatDragBound(pos: { x: number; y: number }) {
    const origin = dragOriginRef.current;
    if (!origin) return pos;
    const clamped = clampGroupDelta(
      origin.members,
      pos.x - origin.x,
      pos.y - origin.y,
      canvasWidth,
      canvasHeight,
      DEFAULT_SEAT_SIZE,
    );
    return { x: origin.x + clamped.dx, y: origin.y + clamped.dy };
  }

  return (
    <section
      aria-label="Bản đồ chỗ ngồi"
      className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card shadow-sm"
    >
      <div className="border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">Bản đồ chỗ ngồi</h3>
        <p className="text-xs text-muted-foreground">
          {editable
            ? 'Ctrl/⌘+click hoặc kéo khung để chọn nhiều ghế. Kéo một ghế đã chọn để di chuyển cả nhóm. Nhấp đúp ghế để sửa thuộc tính. Delete để xóa.'
            : 'Di chuột lên ghế để xem hostname máy trạm đã gắn. Nhấp đúp để xem thuộc tính ghế. Bật chế độ chỉnh sửa để thêm, xóa hoặc sắp xếp ghế.'}
        </p>
      </div>
      <div
        ref={viewportRef}
        className="flex min-h-[28rem] w-full justify-center overflow-auto bg-muted/30 p-3"
      >
        <div className="relative inline-block">
          <Stage
            ref={stageRef}
            width={canvasWidth * scale}
            height={canvasHeight * scale}
            scaleX={scale}
            scaleY={scale}
            onMouseLeave={() => setHoverTip(null)}
          >
            <Layer>
            <Rect
              x={0}
              y={0}
              width={canvasWidth}
              height={canvasHeight}
              fill="#f8fafc"
              stroke="#cbd5e1"
              onMouseDown={onBgPointerDown}
              onTouchStart={onBgPointerDown}
            />
            {seats.map((seat) => {
              const isSelected = selectedSet.has(seat.clientId);
              const ws = seat.workstationId
                ? wsMap.get(seat.workstationId)
                : undefined;
              const look = seatAppearance(seat, isSelected, ws);

              const origin = seatCenterOriginTransform(
                seat.positionX,
                seat.positionY,
              );

              return (
                <Group
                  key={seat.clientId}
                  ref={(node) => {
                    if (node) seatNodesRef.current.set(seat.clientId, node);
                    else seatNodesRef.current.delete(seat.clientId);
                  }}
                  x={origin.x}
                  y={origin.y}
                  offsetX={origin.offsetX}
                  offsetY={origin.offsetY}
                  draggable={editable}
                  dragDistance={SEAT_DRAG_DISTANCE_PX}
                  dragBoundFunc={editable ? seatDragBound : undefined}
                  onMouseDown={(e) => onSeatMouseDown(seat, e)}
                  onTouchStart={(e) => onSeatMouseDown(seat, e)}
                  onClick={(e) => onSeatClick(seat, e)}
                  onTap={(e) => onSeatClick(seat, e)}
                  onDblClick={(e) => openSeatProperties(seat, e)}
                  onDblTap={(e) => openSeatProperties(seat, e)}
                  onMouseEnter={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = 'pointer';
                    showSeatHover(seat, e);
                  }}
                  onMouseMove={(e) => showSeatHover(seat, e)}
                  onMouseLeave={(e) => {
                    const stage = e.target.getStage();
                    if (stage) stage.container().style.cursor = 'default';
                    setHoverTip(null);
                  }}
                  onDragStart={
                    editable
                      ? (e) => onSeatDragStart(seat.clientId, e)
                      : undefined
                  }
                  onDragMove={editable ? onSeatDragMove : undefined}
                  onDragEnd={editable ? onSeatDragEnd : undefined}
                >
                  {seat.shape === 'circle' ? (
                    <Circle
                      x={DEFAULT_SEAT_SIZE / 2}
                      y={DEFAULT_SEAT_SIZE / 2}
                      radius={DEFAULT_SEAT_SIZE / 2}
                      fill={look.fillColor}
                      stroke={look.strokeColor}
                      strokeWidth={look.strokeWidth}
                      opacity={seat.isDisabled ? 0.55 : 1}
                    />
                  ) : seat.shape === 'diamond' ? (
                    <RegularPolygon
                      x={DEFAULT_SEAT_SIZE / 2}
                      y={DEFAULT_SEAT_SIZE / 2}
                      sides={4}
                      radius={DEFAULT_SEAT_SIZE / 2}
                      fill={look.fillColor}
                      stroke={look.strokeColor}
                      strokeWidth={look.strokeWidth}
                      opacity={seat.isDisabled ? 0.55 : 1}
                    />
                  ) : (
                    <Rect
                      width={DEFAULT_SEAT_SIZE}
                      height={DEFAULT_SEAT_SIZE}
                      cornerRadius={6}
                      fill={look.fillColor}
                      stroke={look.strokeColor}
                      strokeWidth={look.strokeWidth}
                      opacity={seat.isDisabled ? 0.55 : 1}
                    />
                  )}
                  {look.badgeText && !seat.isDisabled ? (
                    <>
                      <Rect
                        x={3}
                        y={3}
                        width={16}
                        height={9}
                        cornerRadius={2}
                        fill={look.badgeBg}
                        opacity={0.95}
                        listening={false}
                      />
                      <Text
                        x={3}
                        y={3}
                        width={16}
                        height={9}
                        text={look.badgeText}
                        align="center"
                        verticalAlign="middle"
                        fontSize={7}
                        fontStyle="bold"
                        fill="#ffffff"
                        listening={false}
                      />
                    </>
                  ) : null}
                  <Text
                    text={seat.seatCode}
                    width={DEFAULT_SEAT_SIZE}
                    height={DEFAULT_SEAT_SIZE}
                    align="center"
                    verticalAlign="middle"
                    fontSize={12}
                    fontStyle="bold"
                    fill="#f8fafc"
                    listening={false}
                  />
                </Group>
              );
            })}
            {editable && marquee && marquee.width + marquee.height > 0 ? (
              <Rect
                x={marquee.x}
                y={marquee.y}
                width={marquee.width}
                height={marquee.height}
                fill="rgba(56, 189, 248, 0.16)"
                stroke="#38bdf8"
                strokeWidth={1}
                dash={[6, 4]}
                listening={false}
              />
            ) : null}
            </Layer>
          </Stage>
          {hoverTip ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 max-w-[16rem] truncate rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-md"
              style={{ left: hoverTip.x + 12, top: hoverTip.y + 12 }}
            >
              {hoverTip.hostname}
            </div>
          ) : null}
        </div>
      </div>
      {showLegend ? <SeatingLegend /> : null}
    </section>
  );
}
