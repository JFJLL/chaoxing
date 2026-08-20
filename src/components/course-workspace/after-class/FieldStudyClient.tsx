"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  Clock,
  Compass,
  MapPin,
  PlayCircle,
  PlusCircle,
  Share2,
  Video
} from "lucide-react";
import { mockAfterClassData, type FieldStudyVlogItem } from "@/lib/courseWorkspace/afterClassMock";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export function FieldStudyClient({
  courseId,
  canManage
}: {
  courseId: string;
  canManage: boolean;
}) {
  const [vlogs, setVlogs] = useState<FieldStudyVlogItem[]>(mockAfterClassData.fieldStudyVlogs);
  const [activeVlog, setActiveVlog] = useState<FieldStudyVlogItem | null>(null);

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
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                <Compass className="h-3.5 w-3.5 text-emerald-600" />
                田野调查 · 实践纪实
              </span>
              <Badge tone="green">持续展播</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">行业访学 Vlog 与实践纪实</h1>
            <p className="mt-1 text-sm text-slate-600 max-w-3xl leading-6">
              沉浸式记录名企探营、田野调研与海外交流第一线实况，共享行业真知与痛点洞察。
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => alert("已打开 Vlog/调研纪实上传通道")}><Camera className="h-4 w-4 mr-1" />上传我的调研 Vlog</Button>
          </div>
        </div>
      </div>

      {/* Vlogs List */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {vlogs.map((vlog) => (
          <div
            key={vlog.id}
            className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-panel transition hover:-translate-y-1 hover:shadow-floating"
          >
            <div>
              {/* Video Thumbnail Placeholder */}
              <div
                onClick={() => setActiveVlog(vlog)}
                className="group relative flex h-44 w-full cursor-pointer items-center justify-center rounded-2xl bg-slate-900 text-5xl text-white shadow-inner overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="relative z-10 text-6xl group-hover:scale-110 transition duration-300">{vlog.coverImage}</span>
                <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center justify-between text-xs text-white/90 font-medium">
                  <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-rose-400" />{vlog.location}</span>
                  <span className="flex items-center gap-1 bg-black/50 px-2 py-0.5 rounded-md backdrop-blur-sm"><Clock className="h-3 w-3" />{vlog.duration}</span>
                </div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition">
                  <PlayCircle className="h-12 w-12 text-white/90" />
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5">
                {vlog.tags.map((t) => (
                  <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    {t}
                  </span>
                ))}
              </div>

              <h2 className="mt-3 text-base font-bold text-slate-900 leading-snug">{vlog.title}</h2>
              <p className="mt-1 text-xs text-slate-500">主讲/制作：{vlog.author}</p>
              <p className="mt-3 text-xs leading-relaxed text-slate-600">{vlog.summary}</p>
            </div>

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3.5 text-xs text-emerald-950">
              <p className="font-bold text-emerald-900 mb-0.5">💡 核心实践真知 (Takeaway)</p>
              <p className="leading-5">{vlog.keyTakeaway}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Video Modal Player Simulator */}
      {activeVlog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-slate-900 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-white text-base truncate">{activeVlog.title}</h3>
              <button
                type="button"
                onClick={() => setActiveVlog(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Video Canvas Simulator */}
            <div className="flex h-72 w-full flex-col items-center justify-center rounded-2xl bg-slate-950 border border-white/10 text-center space-y-2">
              <PlayCircle className="h-16 w-16 text-white/80 animate-pulse" />
              <p className="text-sm text-slate-300">正在播放 1080P 实践纪实录像...</p>
              <p className="text-xs text-slate-500">拍摄地点：{activeVlog.location} · 时长：{activeVlog.duration}</p>
            </div>

            <div className="text-xs text-slate-300 leading-relaxed bg-white/5 p-4 rounded-2xl">
              <p className="font-semibold text-white mb-1">纪实心得与调研摘要：</p>
              <p>{activeVlog.summary}</p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setActiveVlog(null)}>关闭播放</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
