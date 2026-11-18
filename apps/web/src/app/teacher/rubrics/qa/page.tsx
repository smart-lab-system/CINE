import { redirect } from 'next/navigation';

/** Tạm thời: Question Agnostic chưa có UI riêng - về dashboard. */
export default function QsAgnosticRedirect(): never {
  redirect('/teacher/dashboard');
}
