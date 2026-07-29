import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isCourseManagerRecord } from "@/lib/permissions";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel } from "@/components/course-workspace/CourseModulePanel";
import { AssessmentCreateClient } from "@/components/course-workspace/AssessmentCreateClient";
import { LinkButton } from "@/components/ui/Button";

type PageProps = { params: Promise<{ courseId: string }> };
export default async function NewAssignmentPage({ params }: PageProps) {
  const user = await requireUser(); const { courseId } = await params; const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  if (!canManage) redirect(`/space/courses/${courseId}/assignments`);
  const questions = await db.courseQuestion.findMany({ where: { courseId, status: "APPROVED" }, select: { id: true, type: true, stem: true }, orderBy: { updatedAt: "desc" } });
  return <FanyaCourseShell user={user} course={course} activeTab="assignments"><CourseModulePanel title="新建作业" description="配置基本信息，从题库选题或连续手工出题。" actions={<LinkButton href={`/space/courses/${courseId}/assignments`} variant="secondary"><ArrowLeft className="h-4 w-4" />返回作业</LinkButton>}><AssessmentCreateClient kind="assignment" courseId={courseId} sourceQuestions={questions} /></CourseModulePanel></FanyaCourseShell>;
}
