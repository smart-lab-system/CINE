export function SeatingLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t bg-card px-3 py-2 text-xs">
      <span className="font-semibold text-muted-foreground">Chú thích:</span>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-purple-300 bg-purple-600" />
        <span>Máy giảng viên (Instructor PC)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-sky-300 bg-sky-600" />
        <span>Máy sinh viên (Student PC)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded border border-slate-400 bg-slate-700" />
        <span>Chưa gắn máy</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded bg-slate-400 opacity-60" />
        <span>Ghế không dùng</span>
      </div>
    </div>
  );
}
