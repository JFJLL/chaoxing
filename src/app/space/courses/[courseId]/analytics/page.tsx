import { BarChart3, BookOpenCheck, ClipboardCheck, Radio, UsersRound } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { buildLearningIndicators } from "@/lib/teaching/analytics";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";

type PageProps = { params: Promise<{ courseId: string }> };
const rateLabel = (value: number | null) => value === null ? "暂无数据" : `${value}%`;

export default async function AnalyticsPage({ params }: PageProps) {
  const user = await requireUser(); const { courseId } = await params; const course = await loadCourseWorkspace(user, courseId); const canManage = isTeacher(user) && (user.role === "ADMIN" || course.ownerId === user.id);
  const studentIds = canManage ? course.enrollments.map((item) => item.userId) : [user.id];
  const now = new Date();
  const completedAttendanceWhere = { OR: [{ status: "ENDED" as const }, { status: "ACTIVE" as const, endsAt: { lte: now } }] };
  const [lessonTotal, lessonProgress, attendanceSessions, attendanceRecords, assignments, exams] = await Promise.all([
    db.lesson.count({ where: { chapter: { courseId } } }),
    db.lessonProgress.findMany({ where: { userId: { in: studentIds }, completedAt: { not: null }, lesson: { chapter: { courseId } } }, select: { userId: true } }),
    db.attendanceSession.count({ where: { courseId, ...completedAttendanceWhere } }),
    db.attendanceRecord.findMany({ where: { userId: { in: studentIds }, status: "PRESENT", session: { courseId, ...completedAttendanceWhere } }, select: { userId: true } }),
    db.assignment.findMany({ where: { courseId, status: "PUBLISHED" }, select: { id: true, submissions: { where: { userId: { in: studentIds }, status: { in: ["SUBMITTED", "GRADED"] } }, select: { userId: true } } } }),
    db.exam.findMany({ where: { courseId, status: "PUBLISHED" }, select: { questions: { select: { points: true } }, attempts: { where: { userId: { in: studentIds }, status: "GRADED" }, select: { userId: true, score: true } } } })
  ]);
  const countFor = (rows: Array<{ userId: string }>, studentId: string) => rows.filter((row) => row.userId === studentId).length;
  const indicatorsFor = (studentId: string) => {
    const gradedAttempts = exams.flatMap((exam) => exam.attempts.map((attempt) => ({ ...attempt, max: exam.questions.reduce((sum, question) => sum + question.points, 0) }))).filter((attempt) => attempt.userId === studentId);
    return buildLearningIndicators({ lessons: { completed: countFor(lessonProgress, studentId), total: lessonTotal }, attendance: { present: countFor(attendanceRecords, studentId), total: attendanceSessions }, assignments: { submitted: assignments.reduce((sum, item) => sum + (item.submissions.some((submission) => submission.userId === studentId) ? 1 : 0), 0), total: assignments.length }, exams: { gradedScore: gradedAttempts.reduce((sum, item) => sum + (item.score ?? 0), 0), gradedMaxScore: gradedAttempts.reduce((sum, item) => sum + item.max, 0) } });
  };
  const students = canManage ? course.enrollments.map((item) => ({ id: item.userId, name: item.user.name, email: item.user.email, indicators: indicatorsFor(item.userId) })) : [{ id: user.id, name: user.name, email: "", indicators: indicatorsFor(user.id) }];
  const mine = students[0]?.indicators ?? buildLearningIndicators({ lessons: { completed: 0, total: 0 }, attendance: { present: 0, total: 0 }, assignments: { submitted: 0, total: 0 }, exams: { gradedScore: 0, gradedMaxScore: 0 } });
  const cards = canManage ? [{ label: "选课学生", value: course.enrollments.length, icon: UsersRound }, { label: "已结束签到", value: attendanceSessions, icon: Radio }, { label: "已发布作业", value: assignments.length, icon: ClipboardCheck }, { label: "已发布考试", value: exams.length, icon: BarChart3 }] : [{ label: "课时完成", value: rateLabel(mine.lessonCompletionRate), icon: BookOpenCheck }, { label: "签到率", value: rateLabel(mine.attendanceRate), icon: Radio }, { label: "作业完成", value: rateLabel(mine.assignmentCompletionRate), icon: ClipboardCheck }, { label: "考试平均", value: rateLabel(mine.examAverageRate), icon: BarChart3 }];
  return <FanyaCourseShell user={user} course={course} activeTab="analytics"><CourseModulePanel title={canManage ? "学情分析" : "我的学习"} description={canManage ? "所有指标均来自真实课时、签到、作业和考试记录。" : "仅展示你自己的真实学习记录，不使用不透明综合分。"}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{cards.map((card) => { const Icon = card.icon; return <article key={card.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-5"><Icon className="h-6 w-6 text-blue-600" /><p className="mt-4 text-sm text-slate-500">{card.label}</p><p className="mt-1 text-2xl font-semibold text-slate-950">{card.value}</p></article>; })}</div>{canManage ? <section className="mt-5 rounded-2xl border border-slate-100 p-5"><div className="flex items-center justify-between"><h2 className="font-semibold text-slate-900">学生学习明细</h2><Badge tone="blue">{students.length} 人</Badge></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="py-3">学生</th><th>课时完成</th><th>签到率</th><th>作业完成</th><th>考试平均</th></tr></thead><tbody>{students.map((student) => <tr key={student.id} className="border-b border-slate-100"><td className="py-3"><p className="font-medium text-slate-900">{student.name}</p><p className="text-xs text-slate-400">{student.email}</p></td><td>{rateLabel(student.indicators.lessonCompletionRate)}</td><td>{rateLabel(student.indicators.attendanceRate)}</td><td>{rateLabel(student.indicators.assignmentCompletionRate)}</td><td>{rateLabel(student.indicators.examAverageRate)}</td></tr>)}</tbody></table></div></section> : null}</CourseModulePanel></FanyaCourseShell>;
}
