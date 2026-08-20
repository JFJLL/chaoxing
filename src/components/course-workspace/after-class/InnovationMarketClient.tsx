"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Heart,
  MessageSquare,
  PlusCircle,
  Share2,
  Sparkles,
  Star,
  Trophy,
  Upload
} from "lucide-react";
import { mockAfterClassData, type InnovationMarketItem } from "@/lib/courseWorkspace/afterClassMock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function InnovationMarketClient({
  courseId,
  canManage
}: {
  courseId: string;
  canManage: boolean;
}) {
  const [items, setItems] = useState<InnovationMarketItem[]>(mockAfterClassData.innovationMarket);
  const [likes, setLikes] = useState<Record<string, number>>({
    "market-1": 342,
    "market-2": 289,
    "market-3": 215
  });
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [selectedItem, setSelectedItem] = useState<InnovationMarketItem | null>(null);
  const [peerComment, setPeerComment] = useState("");
  const [peerScoreInput, setPeerScoreInput] = useState(90);

  const toggleLike = (id: string) => {
    setLikedMap((prev) => {
      const nextVal = !prev[id];
      setLikes((lPrev) => ({
        ...lPrev,
        [id]: (lPrev[id] || 0) + (nextVal ? 1 : -1)
      }));
      return { ...prev, [id]: nextVal };
    });
  };

  const handleReviewSubmit = () => {
    if (!peerComment.trim()) return;
    alert("互评打分与评语已成功提交，计入本课程形成性评价平时分！");
    setPeerComment("");
    setSelectedItem(null);
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
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                作品展映 · 同行互评
              </span>
              <Badge tone="blue">公开展评期</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">AI 文化创新作品集市</h1>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl leading-6">
              汇集各小组产出的 AIGC 文化创新成果（数字壁画、叙事游戏、国风绘本）。支持学生间同行互评打分、点赞推荐与交流互动。
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => alert("已打开作品上传通道，请选择渲染原文件与演示视频。")}><Upload className="h-4 w-4 mr-1" />发布我的作品</Button>
          </div>
        </div>
      </div>

      {/* Showcase Grid */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const isLiked = !!likedMap[item.id];
          const count = likes[item.id] ?? item.likesCount;
          return (
            <div
              key={item.id}
              className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel transition hover:-translate-y-1 hover:shadow-floating"
            >
              <div>
                <div className="flex h-36 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-50 via-slate-50 to-rose-50 text-5xl shadow-inner">
                  {item.coverImage}
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {item.tags.map((t) => (
                    <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {t}
                    </span>
                  ))}
                </div>

                <h2 className="mt-3 text-base font-bold text-slate-900">{item.title}</h2>
                <p className="mt-1 text-xs text-indigo-600 font-medium">创作团队：{item.teamName}</p>
                <p className="mt-3 text-xs leading-relaxed text-slate-600 line-clamp-3">{item.summary}</p>
              </div>

              <div className="mt-6 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 font-bold">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>互评得分: {item.peerScore}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleLike(item.id)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
                        isLiked
                          ? "bg-rose-50 text-rose-600 font-bold"
                          : "bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                      }`}
                    >
                      <Heart className={`h-3.5 w-3.5 ${isLiked ? "fill-rose-500 text-rose-500" : ""}`} />
                      <span>{count}</span>
                    </button>
                    <Button variant="secondary" onClick={() => setSelectedItem(item)}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                      互评打分
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Peer Review Modal Simulator */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">为作品《{selectedItem.title}》互评打分</h3>
                <p className="text-xs text-slate-500 mt-0.5">团队：{selectedItem.teamName}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700">互评打分 (0-100分)</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={60}
                    max={100}
                    value={peerScoreInput}
                    onChange={(e) => setPeerScoreInput(Number(e.target.value))}
                    className="flex-1 accent-[var(--cx-blue)]"
                  />
                  <span className="w-12 text-center text-base font-bold text-[var(--cx-blue)]">{peerScoreInput}分</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700">同行建设性评语（对照教材理论与创新点）</label>
                <textarea
                  rows={4}
                  value={peerComment}
                  onChange={(e) => setPeerComment(e.target.value)}
                  placeholder="请从视觉美学、文化母体提炼、技术可行性及商业潜力等方面给出具体建议..."
                  className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-xs outline-none focus:border-[var(--cx-blue)] focus:ring-2 focus:ring-[var(--cx-blue)]/20"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
              <Button variant="secondary" onClick={() => setSelectedItem(null)}>取消</Button>
              <Button onClick={handleReviewSubmit} disabled={!peerComment.trim()}>提交互评结果</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
