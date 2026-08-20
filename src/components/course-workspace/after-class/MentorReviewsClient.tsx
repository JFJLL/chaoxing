"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Award,
  Briefcase,
  CalendarDays,
  GraduationCap,
  HeartHandshake,
  MessageSquareQuote,
  Sparkles,
  Star,
  UserCheck
} from "lucide-react";
import { mockAfterClassData, type MentorReviewItem } from "@/lib/courseWorkspace/afterClassMock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function MentorReviewsClient({
  courseId,
  canManage
}: {
  courseId: string;
  canManage: boolean;
}) {
  const [reviews, setReviews] = useState<MentorReviewItem[]>(mockAfterClassData.mentorReviews);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-3xl border border-white/80 bg-white p-6 shadow-panel lg:p-7">
        <div className="flex items-center gap-2">
          <Link
            href={`/space/courses/${courseId}/after-class`}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回课后实战总览
          </Link>
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                校友传承 · 行业领航
              </span>
              <Badge tone="blue">专家指导站</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">校友与企业导师点评专区</h1>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl leading-6">
              邀请头部大厂专家、一线投资人及优秀校友入驻，对学生实战方案进行商业与技术可行性把关，强化行业认知与职业认同。
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => alert("已向导师库发出 1v1 方案指导预约申请！")}><HeartHandshake className="h-4 w-4 mr-1" />预约导师 1v1 诊断</Button>
          </div>
        </div>
      </div>

      {/* Reviews Stream */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {reviews.map((item) => (
            <div
              key={item.id}
              className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel space-y-4 transition hover:shadow-floating"
            >
              {/* Mentor Profile Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-2xl shadow-sm">
                    {item.avatar}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-base">{item.mentorName}</h3>
                      {item.isAlumni && (
                        <Badge tone="blue">{item.alumniClass || "优秀校友"}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-indigo-600 font-medium mt-0.5">{item.mentorCompany} · {item.mentorTitle}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 rounded-2xl bg-amber-50 px-3 py-1.5 text-xs text-amber-900 font-bold">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  <span>评分: {item.reviewScore}分</span>
                </div>
              </div>

              {/* Project Title */}
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <Briefcase className="h-4 w-4 text-slate-400" />
                <span>点评项目：</span>
                <span className="text-indigo-600">{item.targetProject}</span>
              </div>

              {/* Review Text */}
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-700">
                <p className="font-semibold text-slate-900 mb-1.5 flex items-center gap-1">
                  <MessageSquareQuote className="h-4 w-4 text-indigo-600" />
                  导师专业批注与反馈：
                </p>
                <p>{item.reviewText}</p>
              </div>

              {/* Career Advice */}
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-xs leading-relaxed text-blue-950">
                <p className="font-semibold text-blue-900 mb-1 flex items-center gap-1">
                  <GraduationCap className="h-4 w-4 text-blue-600" />
                  职业发展与行业认同建议：
                </p>
                <p>{item.careerAdvice}</p>
              </div>

              {/* Footer Meta */}
              <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1">
                <span>点评时间：{item.reviewedAt}</span>
                <span className="text-emerald-600 font-medium flex items-center gap-1">
                  <Award className="h-3.5 w-3.5" /> 官方认证导师评估
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
            <h3 className="font-bold text-slate-900 text-sm">校企导师库入驻指南</h3>
            <p className="mt-1 text-xs text-slate-500">本课程已建立“产学双导师制”</p>
            <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="font-bold text-slate-800">1. 真实业务标准赋能</p>
                <p className="text-slate-500 mt-1">导师带着产业一线真实需求与验收标准参与评审。</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="font-bold text-slate-800">2. 校友传帮带闭环</p>
                <p className="text-slate-500 mt-1">优秀学长学姐分享行业成长经验与求职避坑要点。</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                <p className="font-bold text-slate-800">3. 实习就业内推绿色通道</p>
                <p className="text-slate-500 mt-1">高分方案团队优先获得企业导师直推实习机会。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
