'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { JplagParsedFile, JplagParsedMatch, JplagRunView } from '@/lib/api/ide-utilities';

const MATCH_COLORS = [
  'bg-ev-1/70',
  'bg-ev-2/70',
  'bg-ev-3/70',
  'bg-ev-4/70',
  'bg-accent-subtle',
  'bg-danger-subtle',
];

const CODE_PANE_SCROLL_CLASS = 'h-[min(40vh,360px)] max-h-[360px] overflow-auto bg-muted/20 p-2';

function pathMatches(matchPath: string, file: JplagParsedFile): boolean {
  const norm = matchPath.replace(/\\/g, '/');
  const full = `${file.id}/${file.path}`.replace(/\\/g, '/');
  return (
    full === norm ||
    norm === file.path ||
    norm.endsWith(`/${file.path}`) ||
    file.path.endsWith(norm)
  );
}

function findFileIndex(files: JplagParsedFile[], matchPath: string): number {
  const idx = files.findIndex((f) => pathMatches(matchPath, f));
  return idx >= 0 ? idx : 0;
}

function lineColorMap(matches: JplagParsedMatch[], side: 'first' | 'second', file: JplagParsedFile) {
  const map = new Map<number, number>();
  matches.forEach((m, idx) => {
    const path = side === 'first' ? m.firstPath : m.secondPath;
    if (!pathMatches(path, file)) return;
    const start = side === 'first' ? m.startInFirst.line : m.startInSecond.line;
    const end = side === 'first' ? m.endInFirst.line : m.endInSecond.line;
    for (let line = start; line <= end; line += 1) {
      if (!map.has(line)) map.set(line, idx % MATCH_COLORS.length);
    }
  });
  return map;
}

function pickSideFiles(
  files: JplagParsedFile[],
  submissionId: string | null,
): JplagParsedFile[] {
  if (!submissionId) return files;
  const hit = files.filter((f) => f.id === submissionId);
  return hit.length > 0 ? hit : files;
}

function scrollPaneToLine(root: HTMLDivElement | null, line: number) {
  if (!root) return;
  const el = root.querySelector(`[data-line="${line}"]`) as HTMLElement | null;
  if (!el) return;
  const top = el.offsetTop - root.clientHeight / 2 + el.clientHeight / 2;
  root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

function CodePane({
  title,
  files,
  matches,
  side,
  fileIdx,
  onFileIdxChange,
  activeMatch,
  onLineClick,
  scrollRef,
}: {
  title: string;
  files: JplagParsedFile[];
  matches: JplagParsedMatch[];
  side: 'first' | 'second';
  fileIdx: number;
  onFileIdxChange: (idx: number) => void;
  activeMatch: number | null;
  onLineClick: (matchIndex: number) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const safeIdx = Math.min(Math.max(fileIdx, 0), Math.max(files.length - 1, 0));
  const file = files[safeIdx] ?? files[0];
  const colors = useMemo(
    () => (file ? lineColorMap(matches, side, file) : new Map<number, number>()),
    [matches, side, file],
  );
  const lines = (file?.content ?? '').split(/\r?\n/);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-md border">
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-xs">
        <span className="font-medium">{title}</span>
        {files.length > 1 ? (
          <select
            className="h-7 max-w-[200px] rounded border bg-background px-1 font-mono"
            value={safeIdx}
            onChange={(e) => onFileIdxChange(Number(e.target.value))}
          >
            {files.map((f, i) => (
              <option key={`${f.id}/${f.path}`} value={i}>
                {f.path}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate font-mono text-muted-foreground">{file?.path ?? '-'}</span>
        )}
      </div>
      <div ref={scrollRef} className={CODE_PANE_SCROLL_CLASS}>
        <pre className="font-mono text-[11px] leading-relaxed">
          {lines.map((line, i) => {
            const lineNo = i + 1;
            const colorIdx = colors.get(lineNo);
            const m = activeMatch != null ? matches[activeMatch] : null;
            const isActive =
              !!m &&
              !!file &&
              pathMatches(side === 'first' ? m.firstPath : m.secondPath, file) &&
              lineNo >= (side === 'first' ? m.startInFirst.line : m.startInSecond.line) &&
              lineNo <= (side === 'first' ? m.endInFirst.line : m.endInSecond.line);
            return (
              <div
                key={lineNo}
                data-line={lineNo}
                className={`flex gap-2 rounded-sm px-1 ${
                  colorIdx != null ? MATCH_COLORS[colorIdx] : ''
                } ${isActive ? 'ring-1 ring-foreground/40' : ''} ${
                  colorIdx != null ? 'cursor-pointer' : ''
                }`}
                onClick={() => {
                  if (colorIdx == null || !file) return;
                  const matchIndex = matches.findIndex((row) => {
                    const path = side === 'first' ? row.firstPath : row.secondPath;
                    if (!pathMatches(path, file)) return false;
                    const start = side === 'first' ? row.startInFirst.line : row.startInSecond.line;
                    const end = side === 'first' ? row.endInFirst.line : row.endInSecond.line;
                    return lineNo >= start && lineNo <= end;
                  });
                  if (matchIndex >= 0) onLineClick(matchIndex);
                }}
              >
                <span className="w-8 shrink-0 select-none text-right text-muted-foreground">
                  {lineNo}
                </span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">{line || ' '}</span>
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

export function JplagComparisonViewer({ run }: { run: JplagRunView }) {
  const comparison = run.comparison;
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [activeMatch, setActiveMatch] = useState<number | null>(null);
  const [leftFileIdx, setLeftFileIdx] = useState(0);
  const [rightFileIdx, setRightFileIdx] = useState(0);
  const pendingScroll = useRef<{ left: number; right: number } | null>(null);

  const firstFiles = useMemo(
    () => (comparison ? pickSideFiles(comparison.files, run.firstSubmission) : []),
    [comparison, run.firstSubmission],
  );
  const secondFiles = useMemo(
    () => (comparison ? pickSideFiles(comparison.files, run.secondSubmission) : []),
    [comparison, run.secondSubmission],
  );

  useEffect(() => {
    setActiveMatch(null);
    setLeftFileIdx(0);
    setRightFileIdx(0);
    pendingScroll.current = null;
  }, [run.profile, run.cliLanguage]);

  useEffect(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    pendingScroll.current = null;
    const id = window.requestAnimationFrame(() => {
      scrollPaneToLine(leftRef.current, pending.left);
      scrollPaneToLine(rightRef.current, pending.right);
    });
    return () => window.cancelAnimationFrame(id);
  }, [leftFileIdx, rightFileIdx, activeMatch]);

  if (!comparison) {
    return <p className="text-xs text-muted-foreground">Không có dữ liệu comparison để hiển thị.</p>;
  }

  const selectMatch = (idx: number) => {
    const m = comparison.matches[idx];
    if (!m) return;
    const nextLeft = findFileIndex(firstFiles, m.firstPath);
    const nextRight = findFileIndex(secondFiles, m.secondPath);
    pendingScroll.current = {
      left: m.startInFirst.line,
      right: m.startInSecond.line,
    };
    setActiveMatch(idx);
    setLeftFileIdx(nextLeft);
    setRightFileIdx(nextRight);
    // If file already correct, still scroll this tick
    if (nextLeft === leftFileIdx && nextRight === rightFileIdx) {
      window.requestAnimationFrame(() => {
        scrollPaneToLine(leftRef.current, m.startInFirst.line);
        scrollPaneToLine(rightRef.current, m.startInSecond.line);
        pendingScroll.current = null;
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {comparison.matches.length === 0 ? (
          <span className="text-xs text-muted-foreground">Không có match tile.</span>
        ) : (
          comparison.matches.map((m, i) => (
            <button
              key={`${m.firstPath}-${m.secondPath}-${i}`}
              type="button"
              className={`rounded px-2 py-1 text-[11px] ${MATCH_COLORS[i % MATCH_COLORS.length]} ${
                activeMatch === i ? 'ring-1 ring-foreground/50' : ''
              }`}
              onClick={() => selectMatch(i)}
            >
              match {i + 1} · {m.lengthOfFirst} tok
            </button>
          ))
        )}
      </div>
      <div className="flex flex-col gap-2 lg:flex-row">
        <CodePane
          title={run.firstSubmission ?? 'first'}
          files={firstFiles}
          matches={comparison.matches}
          side="first"
          fileIdx={leftFileIdx}
          onFileIdxChange={setLeftFileIdx}
          activeMatch={activeMatch}
          onLineClick={selectMatch}
          scrollRef={leftRef}
        />
        <CodePane
          title={run.secondSubmission ?? 'second'}
          files={secondFiles}
          matches={comparison.matches}
          side="second"
          fileIdx={rightFileIdx}
          onFileIdxChange={setRightFileIdx}
          activeMatch={activeMatch}
          onLineClick={selectMatch}
          scrollRef={rightRef}
        />
      </div>
    </div>
  );
}
