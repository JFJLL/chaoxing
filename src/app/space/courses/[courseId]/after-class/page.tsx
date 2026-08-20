import { ArrowRight, Bot, ClipboardList, PenLine, ScrollText } from "lucide-react";
import { Compass, Sparkles, Trophy, UserCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadCourseWorkspace } from "@/lib/courseWorkspace/data";
import { isCourseManagerRecord } from "@/lib/permissions";
import { FanyaCourseShell } from "@/components/course-workspace/FanyaCourseShell";
import { CourseModulePanel, courseModuleLinkCardClassName } from "@/components/course-workspace/CourseModulePanel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { db } from "@/lib/db";
import Link from "next/link";

type PageProps = { params: Promise<{ courseId: string }> };

export default async function AfterClassPage({ params }: PageProps) {
  const user = await requireUser();
  const { courseId } = await params;
  const course = await loadCourseWorkspace(user, courseId);
  const canManage = isCourseManagerRecord(user, course);
  const [assignmentCount, examCount, questionCount] = await Promise.all([
    db.assignment.count({ where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) } }),
    db.exam.count({ where: { courseId, ...(canManage ? {} : { status: "PUBLISHED" }) } }),
    canManage ? db.courseQuestion.count({ where: { courseId, status: "APPROVED" } }) : Promise.resolve(0)
  ]);
  const modules = [
    { title: "作业", description: "学生查看并提交老师发布的作业。", href: `/space/courses/${course.id}/assignments`, icon: PenLine, count: assignmentCount },
    { title: "考试", description: "学生在规定时间内参加正式考试。", href: `/space/courses/${course.id}/exams`, icon: ClipboardList, count: examCount },
    { title: "题库", description: "教师维护已确认题目，供作业和考试复用。", href: `/space/courses/${course.id}/question-bank`, icon: ScrollText, count: questionCount }
  ];

  const practicalModules = [
    { title: "企业命题挑战赛", description: "企业抛真实问题、学生组队攻坚解题，直通孵化奖金池。", href: `/space/courses/${course.id}/after-class/enterprise-challenges`, icon: Trophy, badge: "产教真题" },
    { title: "AI文化创新作品集市", description: "学生AIGC多模态创新作品公开展映，支持同行互评与点赞。", href: `/space/courses/${course.id}/after-class/innovation-market`, icon: Sparkles, badge: "展映互评" },
    { title: "行业访学与实践纪实", description: "名企探营、田野调查与海外访学Vlog分享，沉淀实践真知。", href: `/space/courses/${course.id}/after-class/field-study`, icon: Compass, badge: "纪实Vlog" },
    { title: "校友与企业导师点评", description: "行业专家与优秀校友入驻点评方案，强化职业认知与认同。", href: `/space/courses/${course.id}/after-class/mentor-reviews`, icon: UserCheck, badge: "导师指导" }
  ];

  return (
    <FanyaCourseShell user={user} course={course} activeTab="after-class">
      <CourseModulePanel
        title="课后"
        description={canManage ? "管理作业、考试、检测，并组织产教融合实战竞赛与作品展映。" : "完成老师发布的作业与考试，参与企业挑战赛、集市互评与导师互动。"}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/question_generation`} variant="secondary">
                <Bot className="h-4 w-4" />
                生成课后练习
              </LinkButton>
              <LinkButton href={`/space/courses/${course.id}/ai-workbench/apps/paper_assembly`} variant="secondary">
                <Bot className="h-4 w-4" />
                创建测验卷
              </LinkButton>
            </div>
          ) : null
        }
      >
        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">基础学业与考核</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {modules.filter((module) => canManage || module.title !== "题库").map((module) => {
                const Icon = module.icon;
                return (
                  <Link key={module.title} href={module.href} className={courseModuleLinkCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[var(--cx-blue)] shadow-sm transition group-hover:shadow-md">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone={module.count ? "blue" : "gray"}>{module.count} 项</Badge>
                        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[var(--cx-blue)]" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-4 font-semibold text-slate-900">{module.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{module.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-700 flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                产教融合实战与创新空间
              </h2>
              <span className="text-xs text-slate-400">真实命题 · 开放互评 · 导师带教</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {practicalModules.map((module) => {
                const Icon = module.icon;
                return (
                  <Link key={module.title} href={module.href} className={courseModuleLinkCardClassName}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm transition group-hover:shadow-md">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tone="blue">{module.badge}</Badge>
                        <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" aria-hidden="true" />
                      </span>
                    </div>
                    <h3 className="mt-4 font-semibold text-slate-900">{module.title}</h3>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{module.description}</p>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 p-5 bg-slate-50/50">
            <h3 className="font-semibold text-slate-900 text-sm">AI 赋能产教融合教学闭环</h3>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              学生在课后通过企业命题进行方案攻关，由 AI 助教对照理论模型初审，并在集市公开展映与互评；最后由企业导师与校友进行实战把关与转化推介。
            </p>
          </div>
        </div>
      </CourseModulePanel>
    </FanyaCourseShell>
  );
}
