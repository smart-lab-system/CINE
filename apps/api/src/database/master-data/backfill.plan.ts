import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
  normalizeRoomName,
  roomNameProblem,
} from '../../common/master-data-normalize';
import { semesterLabel } from '../../common/semester-label';
import type {
  BackfillOptions,
  BackfillPlan,
  BackfillProblem,
  BackfillProblemCode,
  LegacyClass,
  LegacySnapshot,
} from './backfill.types';
import { parseSemesterName, type ParsedSemester } from './semester-name';

/** Khớp `ck_student_mssv` ở DB. */
const MSSV_PATTERN = /^[A-Za-z0-9]{4,20}$/;
const lower = (text: string) => text.toLowerCase();
const semesterKey = (s: ParsedSemester) => `${s.year}:${s.term}`;
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Giới hạn ảnh chụp ở một tập lớp (kèm phiên và enrollment của chúng). Không có tập → trả nguyên ảnh chụp. */
export function scopeSnapshot(snapshot: LegacySnapshot, classIds: readonly string[] | undefined): LegacySnapshot {
  if (!classIds) return snapshot;
  const keep = new Set(classIds);
  return {
    ...snapshot,
    classes: snapshot.classes.filter((c) => keep.has(c.id)),
    sessions: snapshot.sessions.filter((s) => keep.has(s.classId)),
    enrollments: snapshot.enrollments.filter((e) => keep.has(e.homeClassId)),
  };
}

export function isEmptyPlan(plan: BackfillPlan): boolean {
  return (
    plan.merges.length === 0 &&
    plan.semesters.length === 0 &&
    plan.administrativeClasses.length === 0 &&
    plan.classAssignments.length === 0 &&
    plan.rooms.length === 0 &&
    plan.roomAssignments.length === 0 &&
    plan.semesterNameRewrites.length === 0 &&
    plan.students.length === 0
  );
}

/**
 * Lập kế hoạch đưa dữ liệu cũ sang hình dạng đích (spec §8.2–8.3). THUẦN: không DB, không đồng hồ — nên "dừng thay vì đoán" là thuộc tính của hàm
 * này và test được từng ca. Trả `problems` KHÔNG rỗng nghĩa là kế hoạch không được áp (runner ném `BackfillBlockedError`); `plan` khi đó chỉ để
 * chẩn đoán.
 *
 * Mọi thứ đã ở hình dạng đích thì không có mặt trong kế hoạch (lớp đã có kỳ/mã, sinh viên đã có, phòng đã có, phiên đã có phòng, chuỗi đã chuẩn) —
 * đó là cái làm backfill chạy lại không đổi gì và không bao giờ ghi đè thứ admin đã sửa.
 */
export function planBackfill(
  rawSnapshot: LegacySnapshot,
  options: BackfillOptions = {},
): { plan: BackfillPlan; problems: BackfillProblem[] } {
  const snap = scopeSnapshot(rawSnapshot, options.onlyClassIds);
  const problems: BackfillProblem[] = [];
  const problem = (code: BackfillProblemCode, message: string) => problems.push({ code, message });

  const classesByName = new Map<string, LegacyClass[]>();
  for (const c of snap.classes) {
    if (c.name === null) continue;
    classesByName.set(c.name, [...(classesByName.get(c.name) ?? []), c]);
  }
  const mssvOf = new Map<string, Set<string>>();
  for (const e of snap.enrollments) {
    const set = mssvOf.get(e.homeClassId) ?? new Set<string>();
    set.add(lower(e.studentMssv));
    mssvOf.set(e.homeClassId, set);
  }

  // ---------------------------------------------------------------- gộp lớp
  const merges: BackfillPlan['merges'] = [];
  const mergedInto = new Map<string, string>();
  for (const { from, into } of options.merges ?? []) {
    const intoCandidates = classesByName.get(into) ?? [];
    const fromCandidates = classesByName.get(from) ?? [];
    if (intoCandidates.length === 0) {
      problem('MERGE_CLASS_MISSING', `Lớp đích "${into}" không tồn tại — không gộp "${from}" vào đâu được.`);
      continue;
    }
    if (intoCandidates.length > 1 || fromCandidates.length > 1) {
      problem('MERGE_CLASS_AMBIGUOUS', `Tên "${from}" hoặc "${into}" trùng ở nhiều lớp (nhiều giảng viên) — không biết gộp lớp nào.`);
      continue;
    }
    // Lớp nguồn đã mất = đã gộp ở lần chạy trước: không phải vấn đề, và là điều làm lệnh gộp chạy lại được.
    if (fromCandidates.length === 0) continue;
    const [source] = fromCandidates;
    const [target] = intoCandidates;
    if (source.id === target.id) {
      problem('MERGE_CLASS_AMBIGUOUS', `Không gộp "${from}" vào chính nó.`);
      continue;
    }
    if (source.teacherId !== target.teacherId) {
      problem('MERGE_TEACHER_MISMATCH', `"${from}" và "${into}" thuộc hai giảng viên khác nhau — gộp sẽ đổi chủ của bài thi và danh sách.`);
      continue;
    }
    const inTarget = mssvOf.get(target.id) ?? new Set<string>();
    const missing = [...(mssvOf.get(source.id) ?? [])].filter((m) => !inTarget.has(m));
    if (missing.length > 0) {
      problem(
        'MERGE_STUDENT_NOT_IN_TARGET',
        `${missing.length} sinh viên của "${from}" chưa có ở "${into}" (${missing.slice(0, 5).join(', ')}) — gộp sẽ làm mất họ khỏi danh sách.`,
      );
      continue;
    }
    mergedInto.set(source.id, target.id);
    merges.push({ fromId: source.id, intoId: target.id, fromName: from, intoName: into });
  }
  for (const m of merges) {
    if (mergedInto.has(m.intoId)) problem('MERGE_CHAIN', `"${m.intoName}" vừa là đích vừa là nguồn của một lệnh gộp — không hỗ trợ gộp chuỗi.`);
  }
  const liveClassId = (classId: string) => mergedInto.get(classId) ?? classId;

  // ------------------------------------------------- học kỳ + mã của từng lớp
  const semesterById = new Map(snap.semesters.map((s) => [s.id, s]));
  const adminById = new Map(snap.administrativeClasses.map((a) => [a.id, a]));
  const sessionsOfClass = new Map<string, typeof snap.sessions>();
  for (const s of snap.sessions) {
    const id = liveClassId(s.classId);
    sessionsOfClass.set(id, [...(sessionsOfClass.get(id) ?? []), s]);
  }

  const classAssignments: BackfillPlan['classAssignments'] = [];
  const neededSemesters = new Map<string, ParsedSemester>();
  const neededCodes = new Set<string>();
  const keyOwners = new Map<string, string[]>();

  for (const c of [...snap.classes].sort((a, b) => byText(a.id, b.id))) {
    if (mergedInto.has(c.id)) continue;
    const label = c.name ?? c.id;

    let semester: ParsedSemester | undefined;
    if (c.semesterId === null) {
      const found = new Map<string, ParsedSemester>();
      for (const s of sessionsOfClass.get(c.id) ?? []) {
        const parsed = parseSemesterName(s.semesterName);
        if (parsed) found.set(semesterKey(parsed), parsed);
      }
      if (found.size > 1) {
        problem('CLASS_SEMESTER_CONFLICT', `Lớp "${label}" có phiên ở nhiều học kỳ (${[...found.keys()].sort().join(', ')}) — một lớp chỉ thuộc một kỳ; xử lý tay trước.`);
      } else if (found.size === 1) {
        [semester] = found.values();
      } else if (options.defaultSemester) {
        semester = options.defaultSemester;
      } else {
        problem('CLASS_SEMESTER_UNKNOWN', `Lớp "${label}" không có phiên nào đọc ra học kỳ — truyền --default-semester YYYY:T (một GIẢ ĐỊNH cần admin xác nhận) hoặc gán tay.`);
      }
    }

    let code: string | undefined;
    if (c.administrativeClassId === null) {
      const candidate = normalizeAdministrativeCode(c.name ?? '');
      const bad = c.name === null ? 'lớp không có tên' : administrativeCodeProblem(candidate);
      if (bad) {
        problem('CLASS_CODE_UNMAPPABLE', `Lớp "${label}" không đọc được thành mã lớp danh nghĩa (${bad}) — gộp vào lớp thật bằng --merge, hoặc đổi tên/gán tay.`);
      } else {
        code = candidate;
      }
    }

    if (semester || code) {
      classAssignments.push({ classId: c.id, ...(semester ? { semester } : {}), ...(code ? { code } : {}) });
      if (semester) neededSemesters.set(semesterKey(semester), semester);
      if (code) neededCodes.add(code);
    }

    // Khoá duy nhất `(kỳ, mã, nhóm)` — kiểm trước để báo bằng tên lớp thay vì một lỗi 23505 của DB giữa transaction.
    let effectiveSemesterKey: string | null = null;
    if (c.semesterId !== null) {
      const existing = semesterById.get(c.semesterId);
      if (existing) effectiveSemesterKey = `${existing.academicYearStart}:${existing.term}`;
    } else if (semester) {
      effectiveSemesterKey = semesterKey(semester);
    }
    const effectiveCode = c.administrativeClassId !== null ? adminById.get(c.administrativeClassId)?.code : code;
    if (effectiveSemesterKey && effectiveCode) {
      const key = `${effectiveSemesterKey}|${effectiveCode}|${c.groupName}`;
      keyOwners.set(key, [...(keyOwners.get(key) ?? []), label]);
    }
  }
  for (const [key, owners] of keyOwners) {
    if (owners.length > 1) {
      problem('CLASS_KEY_COLLISION', `${owners.length} lớp cùng (kỳ|mã|nhóm) = ${key} (${owners.join('; ')}) — gộp hoặc đặt nhóm khác trước.`);
    }
  }

  const existingSemesterKeys = new Set(snap.semesters.map((s) => `${s.academicYearStart}:${s.term}`));
  const semesters = [...neededSemesters.entries()]
    .filter(([key]) => !existingSemesterKeys.has(key))
    .map(([, value]) => value)
    .sort((a, b) => a.year - b.year || a.term - b.term);
  const existingCodes = new Set(snap.administrativeClasses.map((a) => lower(a.code)));
  const administrativeClasses = [...neededCodes].filter((code) => !existingCodes.has(lower(code))).sort(byText);

  // ---------------------------------------------------- viết lại chuỗi học kỳ
  const semesterNameRewrites: BackfillPlan['semesterNameRewrites'] = [];
  for (const s of snap.sessions) {
    const parsed = parseSemesterName(s.semesterName);
    if (!parsed) continue; // chuỗi không đọc được (TEST …) GIỮ NGUYÊN để còn nhận ra
    const label = semesterLabel(parsed.year, parsed.term);
    if (label !== s.semesterName) semesterNameRewrites.push({ sessionId: s.id, label });
  }
  semesterNameRewrites.sort((a, b) => byText(a.sessionId, b.sessionId));

  // -------------------------------------------------------------------- phòng
  const existingRooms = new Set(snap.rooms.map((r) => lower(r.name)));
  const inactive = new Set((options.inactiveRooms ?? []).map((name) => lower(normalizeRoomName(name))));
  const roomsToCreate = new Map<string, { name: string; isActive: boolean }>();
  const assignmentsByRoom = new Map<string, { name: string; sessionIds: string[] }>();
  for (const s of snap.sessions) {
    if (s.roomId !== null) continue;
    const name = normalizeRoomName(s.roomName);
    const bad = roomNameProblem(name);
    if (bad) {
      problem('ROOM_NAME_INVALID', `Phiên ${s.id}: phòng "${s.roomName}" không hợp lệ (${bad})`);
      continue;
    }
    const key = lower(name);
    if (!existingRooms.has(key) && !roomsToCreate.has(key)) roomsToCreate.set(key, { name, isActive: !inactive.has(key) });
    const entry = assignmentsByRoom.get(key) ?? { name, sessionIds: [] };
    entry.sessionIds.push(s.id);
    assignmentsByRoom.set(key, entry);
  }
  const rooms = [...roomsToCreate.values()].sort((a, b) => byText(a.name, b.name));
  const roomAssignments = [...assignmentsByRoom.values()]
    .map((entry) => ({ name: entry.name, sessionIds: [...entry.sessionIds].sort(byText) }))
    .sort((a, b) => byText(a.name, b.name));

  // ---------------------------------------------------------------- sinh viên
  const existingStudents = new Set(snap.students.map((s) => lower(s.mssv)));
  const candidates = new Map<string, { mssv: string; names: Set<string> }>();
  for (const e of snap.enrollments) {
    if (mergedInto.has(e.homeClassId)) continue; // enrollment của lớp bị gộp là bản trùng của lớp đích
    const key = lower(e.studentMssv);
    const entry = candidates.get(key) ?? { mssv: e.studentMssv, names: new Set<string>() };
    const name = (e.studentName ?? '').normalize('NFC').trim();
    if (name !== '') entry.names.add(name);
    candidates.set(key, entry);
  }
  const students: BackfillPlan['students'] = [];
  for (const [key, { mssv, names }] of [...candidates].sort(([a], [b]) => byText(a, b))) {
    if (existingStudents.has(key)) continue; // không bao giờ ghi đè tên đã lưu
    if (!MSSV_PATTERN.test(mssv)) {
      problem('STUDENT_MSSV_INVALID', `MSSV "${mssv}" không đúng khuôn (4–20 chữ/số) — sửa trong enrollment trước.`);
    } else if (names.size === 0) {
      problem('STUDENT_NAME_BLANK', `MSSV ${mssv} không có tên ở enrollment nào — không có gì để ghi vào \`student\`.`);
    } else if (names.size > 1) {
      problem('STUDENT_NAME_CONFLICT', `MSSV ${mssv} có ${names.size} tên khác nhau (${[...names].join(' | ')}) — chọn một tên trước.`);
    } else {
      students.push({ mssv, fullName: [...names][0] });
    }
  }

  return {
    plan: {
      merges,
      semesters,
      administrativeClasses,
      classAssignments,
      rooms,
      roomAssignments,
      semesterNameRewrites,
      students,
    },
    problems,
  };
}
