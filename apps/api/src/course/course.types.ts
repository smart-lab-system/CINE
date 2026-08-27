export interface CourseView {
  id: string;
  code: string;
  name: string;
  semesterId: string;
  // How many students are enrolled in this course (via Enrollment) —
  // powers the create-exam-session form's non-blocking capacity-vs-
  // enrollment warning once a Room is also selected.
  enrollmentCount: number;
}
