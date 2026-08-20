"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Download,
  Flame,
  PlusCircle,
  Send,
  Sparkles,
  Trophy,
  Users
} from "lucide-react";
import { mockAfterClassData, type EnterpriseChallengeItem } from "@/lib/courseWorkspace/afterClassMock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function EnterpriseChallengesClient({
  courseId,
  canManage
}: {
  courseId: string;
  canManage: boolean;
}) {
  const [challenges, setChallenges] = useState<EnterpriseChallengeItem[]>(mockAfterClassData.enterpriseChallenges);
  const [selectedChallenge, setSelectedChallenge] = useState<EnterpriseChallengeItem | null>(null);
  const [myTeamName, setMyTeamName] = useState("");
  const [joinedChallenges, setJoinedChallenges] = useState<Record<string, boolean>>({ "chal-1": true });

  const handleJoin = (id: string) => {
    setJoinedChallenges((prev) => ({ ...prev, [id]: true }));
    alert("已成功组队报名！任务书与技术基线指南已发送至您的小组云盘。");
  };

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
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
                <Trophy className="h-3.5 w-3.5 text-rose-600" />
                产教协同 · 真题真做
              </span>
              <Badge tone="orange">进行中</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">企业命题挑战赛</h1>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl leading-6">
              企业直抛真实业务痛点，学生组队攻关。方案直通企业孵化奖金池，并由企业命题导师与校友联合评审打分。
            </p>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <Button variant="secondary" onClick={() => alert("教师端可新建企业命题合作需求。")}><PlusCircle className="h-4 w-4 mr-1" />发布新命题</Button>
            )}
            <Button onClick={() => alert("已导出本期全部企业挑战赛命题手册(PDF)")}><Download className="h-4 w-4 mr-1" />下载命题手册</Button>
          </div>
        </div>
      </div>

      {/* Challenges List */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="space-y-4">
            {challenges.map((item) => {
              const hasJoined = !!joinedChallenges[item.id];
              return (
                <div
                  key={item.id}
                  className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel transition hover:shadow-floating"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl shadow-sm">
                        {item.enterpriseLogo}
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-indigo-600">{item.enterpriseName}</p>
                        <h2 className="text-base font-bold text-slate-900 mt-0.5">{item.title}</h2>
                      </div>
                    </div>
                    <Badge tone={hasJoined ? "green" : "blue"}>{hasJoined ? "已组队报名" : "招募中"}</Badge>
                  </div>

                  <p className="mt-4 text-xs leading-relaxed text-slate-600">{item.description}</p>

                  {/* Requirements list */}
                  <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 space-y-2">
                    <p className="text-xs font-bold text-slate-700">📌 交付成果核心要求：</p>
                    {item.requirements.map((req, rIdx) => (
                      <div key={rIdx} className="text-xs text-slate-600 flex items-start gap-1.5">
                        <span className="text-indigo-600 font-bold">•</span>
                        <span>{req}</span>
                      </div>
                    ))}
                  </div>

                  {/* Footer Meta */}
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-amber-600 font-bold">
                        <Trophy className="h-3.5 w-3.5" /> {item.prizePool}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-slate-400" /> {item.teamsCount} 支队伍已报名
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> 截止：{item.deadline}
                      </span>
                    </div>

                    <div className="flex gap-2">
                      {hasJoined ? (
                        <Button variant="secondary" onClick={() => alert(`已打开 ${item.title} 的作品提交通道`)}>
                          <Send className="h-3.5 w-3.5 mr-1" />
                          提交方案成果
                        </Button>
                      ) : (
                        <Button onClick={() => handleJoin(item.id)}>
                          一键组队报名
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel">
            <h3 className="font-bold text-slate-900 text-sm">挑战赛赛制与评审流程</h3>
            <div className="mt-4 space-y-3 text-xs text-slate-600 leading-relaxed">
              <div className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px]">1</span>
                <div>
                  <p className="font-semibold text-slate-800">自由组队与选题 (3-5人)</p>
                  <p className="text-slate-500 mt-0.5">结合小组专长认领企业真实命题。</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px]">2</span>
                <div>
                  <p className="font-semibold text-slate-800">AI助教初稿理论诊断</p>
                  <p className="text-slate-500 mt-0.5">借助AI助教专栏对照教材打分优化。</p>
                </div>
              </div>
              <div className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px]">3</span>
                <div>
                  <p className="font-semibold text-slate-800">企业导师答辩与落地转化</p>
                  <p className="text-slate-500 mt-0.5">优秀方案直通企业采购或创业孵化。</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50/50 p-6 text-amber-950">
            <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
              <Flame className="h-4 w-4 text-amber-600" />
              优秀方案孵化直通车
            </div>
            <p className="mt-2 text-xs leading-5 text-amber-900/80">
              往届获胜项目已有 3 组获得文创基金种子轮意向投资，并在杭州良渚数字文化街区成功落地应用！
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
