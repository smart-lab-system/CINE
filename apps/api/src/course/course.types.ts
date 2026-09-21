/** One student on a class list, as both the import and the readback speak it. */
export interface RosterEntry {
  mssv: string;
  name: string;
}

/**
 * What an import actually did, counted server-side.
 *
 * The browser showed a preview before the user confirmed; these numbers are
 * the database's answer, which is the one worth reporting back. `missing` is
 * present whether or not `removeMissing` was set — naming who is on the list
 * but not in the file is the whole point of reporting it.
 */
export interface RosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: RosterEntry[];
}

/**
 * A class as its own lecturer sees it in the create-session form: enough to
 * pick one and to warn about a room too small, without a second round-trip
 * per row.
 */
export interface TeachingClassView {
  id: string;
  name: string;
  /** Tên môn dạng văn bản. `courseId`/`courseCode` biến mất cùng bảng
   *  `course` ở đợt thu hẹp master data. */
  courseName: string;
  /** Students on the imported roster — 0 means nobody has imported one yet. */
  studentCount: number;
}
