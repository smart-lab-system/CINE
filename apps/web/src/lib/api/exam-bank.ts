import { getAccessToken } from "@/lib/auth-token";
import type { PlaygroundLanguage } from "@/lib/api/playground";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);

export type CourseExamStatus = "draft" | "ready";
export type CourseExamType = "TK" | "GK" | "CK";
export type CourseExamLanguage = PlaygroundLanguage;

export const COURSE_EXAM_TYPE_OPTIONS: {
  value: CourseExamType;
  label: string;
}[] = [
  { value: "TK", label: "Thường kỳ" },
  { value: "GK", label: "Giữa kỳ" },
  { value: "CK", label: "Cuối kỳ" },
];

export const COURSE_EXAM_LANGUAGE_OPTIONS: {
  value: CourseExamLanguage;
  label: string;
}[] = [
  { value: "static", label: "Web tĩnh (HTML/CSS/JS)" },
  { value: "vite-react", label: "Vite + React" },
  { value: "express", label: "Express + EJS" },
  { value: "spring-boot", label: "Spring Boot + MariaDB" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "python", label: "Python" },
];

export const COURSE_EXAM_TYPE_LABELS: Record<CourseExamType, string> = {
  TK: "thường kỳ",
  GK: "giữa kỳ",
  CK: "cuối kỳ",
};

export function buildCourseExamTitle(
  examType: CourseExamType,
  courseName: string,
  detail?: string,
): string {
  const base = `Đề thi ${COURSE_EXAM_TYPE_LABELS[examType]} - ${courseName}`;
  const trimmed = detail?.trim();
  const full = trimmed ? `${base} - ${trimmed}` : base;
  return full.length <= 200 ? full : full.slice(0, 200);
}

export interface TeachingCourse {
  id: string;
  code: string;
  name: string;
}

export interface CourseExamQuestion {
  id?: string;
  ordinal?: number;
  title: string | null;
  statement: string;
  points: number;
  rubricId?: string | null;
  rubricName?: string | null;
  rubricKind?: 'qa' | 'qs' | null;
}

export interface CourseExamSummary {
  id: string;
  courseId: string;
  courseCode: string;
  courseName: string;
  title: string;
  examType: CourseExamType;
  status: CourseExamStatus;
  language: CourseExamLanguage;
  /** Soft-deactivate admin; optional cho response cũ. */
  isActive?: boolean;
  questionCount: number;
  /** Trần điểm đề. */
  totalPoints: number;
  /** Tổng điểm các câu đã phân bổ. */
  allocatedPoints: number;
  createdAt: string;
  updatedAt: string;
}

export interface CourseExamDetail extends CourseExamSummary {
  /** Mô tả dùng chung cho toàn đề. */
  description: string | null;
  questions: CourseExamQuestion[];
}

export class ExamBankHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ExamBankHttpError";
  }
}

async function bankFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body.message === "string") message = body.message;
      else if (Array.isArray(body.message)) message = body.message.join(", ");
    } catch {
      /* ignore */
    }
    throw new ExamBankHttpError(message, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listTeachingCoursesForBank() {
  return bankFetch<TeachingCourse[]>("/exam-bank/courses");
}

export function listCourseExams(courseId: string) {
  return bankFetch<CourseExamSummary[]>(
    `/exam-bank?courseId=${encodeURIComponent(courseId)}`,
  );
}

export function getCourseExam(id: string) {
  return bankFetch<CourseExamDetail>(`/exam-bank/${id}`);
}

export function createCourseExam(body: {
  courseId: string;
  examType: CourseExamType;
  language: CourseExamLanguage;
  totalPoints: number;
  description?: string;
  questions: {
    title?: string;
    statement: string;
    points: number;
    rubricId?: string | null;
  }[];
}) {
  return bankFetch<CourseExamDetail>("/exam-bank", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateCourseExam(
  id: string,
  body: {
    examType?: CourseExamType;
    language?: CourseExamLanguage;
    totalPoints?: number;
    description?: string;
    status?: CourseExamStatus;
    questions?: {
      title?: string;
      statement: string;
      points: number;
      rubricId?: string | null;
    }[];
  },
) {
  return bankFetch<CourseExamDetail>(`/exam-bank/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteCourseExam(id: string) {
  return bankFetch<{ ok: boolean }>(`/exam-bank/${id}`, { method: "DELETE" });
}

export interface ParsedCourseExamDocx {
  examType: CourseExamType;
  language: CourseExamLanguage;
  description: string | null;
  totalPoints: number;
  questions: { title?: string; statement: string; points: number }[];
  warnings: string[];
}

/** Parse Word → draft (không lưu DB). */
export async function parseCourseExamDocx(
  courseId: string,
  file: File,
): Promise<ParsedCourseExamDocx> {
  const token = await getAccessToken();
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(
    `${API_BASE}/exam-bank/parse-docx?courseId=${encodeURIComponent(courseId)}`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body,
    },
  );
  if (!res.ok) {
    let message = `Yêu cầu thất bại (HTTP ${res.status})`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (typeof data.message === "string") message = data.message;
      else if (Array.isArray(data.message)) message = data.message.join(", ");
    } catch {
      /* ignore */
    }
    throw new ExamBankHttpError(message, res.status);
  }
  return (await res.json()) as ParsedCourseExamDocx;
}

/** Tải đề Word (.docx) dạng Blob (gắn phiên / tải tay). */
export async function fetchCourseExamDocx(
  id: string,
): Promise<{ blob: Blob; filename: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}/exam-bank/${id}/export.docx`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    let message = `Tải Word thất bại (HTTP ${res.status})`;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (typeof data.message === "string") message = data.message;
      else if (Array.isArray(data.message)) message = data.message.join(", ");
    } catch {
      /* ignore */
    }
    throw new ExamBankHttpError(message, res.status);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/i.exec(cd);
  const filename = match?.[1] ?? `de-thi-${id}.docx`;
  return { blob, filename };
}

/** Tải đề Word (.docx) về máy. */
export async function downloadCourseExamDocx(id: string): Promise<void> {
  const { blob, filename } = await fetchCourseExamDocx(id);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
