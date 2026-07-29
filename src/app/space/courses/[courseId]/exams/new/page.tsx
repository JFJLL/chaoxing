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
export default async function NewExamPage({ params }: PageProps) {
  const user = await requireUser(); const { courseId } = await params; const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  if (!canManage) redirect(`/space/courses/${courseId}/exams`);
  const [questions, paperSources] = await Promise.all([
    db.courseQuestion.findMany({ where: { courseId, status: "APPROVED" }, select: { id: true, type: true, stem: true }, orderBy: { updatedAt: "desc" } }),
    db.courseAiArtifact.findMany({ where: { courseId, appType: "paper_assembly", status: { in: ["APPROVED", "PUBLISHED"] } }, select: { id: true, title: true }, orderBy: { updatedAt: "desc" } })
  ]);
  return <FanyaCourseShell user={user} course={course} activeTab="exams"><CourseModulePanel title="新建考试" description="配置考试时间，从题库或 AI 组卷模板选题，并补充手工题目。" actions={<LinkButton href={`/space/courses/${courseId}/exams`} variant="secondary"><ArrowLeft className="h-4 w-4" />返回考试</LinkButton>}><AssessmentCreateClient kind="exam" courseId={courseId} sourceQuestions={questions} paperSources={paperSources} /></CourseModulePanel></FanyaCourseShell>;
}
