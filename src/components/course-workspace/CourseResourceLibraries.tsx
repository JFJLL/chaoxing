"use client";

import { useEffect, useState } from "react";
import { BriefcaseBusiness, GraduationCap, LibraryBig, Loader2 } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";

type LibraryKind = "case" | "project" | "video";

type LibraryState = {
  kind: LibraryKind;
  folderId: string | null;
  name: string;
  count: number;
};

const libraryDefinitions: Array<{
  kind: LibraryKind;
  title: string;
  description: string;
  icon: typeof LibraryBig;
}> = [
  {
    kind: "case",
    title: "案例库",
    description: "沉淀可用于课堂讲解、讨论和出题的真实案例。",
    icon: LibraryBig
  },
  {
    kind: "project",
    title: "项目库",
    description: "保存课程项目、实训任务和阶段性交付要求。",
    icon: BriefcaseBusiness
  },
  {
    kind: "video",
    title: "慕课 / 参考视频",
    description: "收录慕课章节、示范视频和课外参考内容。",
    icon: GraduationCap
  }
];

function isLibraryState(value: unknown): value is LibraryState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LibraryState>;
  return (
    (item.kind === "case" || item.kind === "project" || item.kind === "video") &&
    (typeof item.folderId === "string" || item.folderId === null) &&
    typeof item.name === "string" &&
    typeof item.count === "number"
  );
}

export function CourseResourceLibraries({ courseId }: { courseId: string }) {
  const [libraries, setLibraries] = useState<LibraryState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<LibraryKind | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/courses/${courseId}/resource-libraries`);
        const body = (await response.json().catch(() => null)) as { libraries?: unknown; error?: string } | null;
        if (!response.ok) throw new Error(body?.error || "资料库加载失败");
        if (!cancelled) {
          setLibraries(Array.isArray(body?.libraries) ? body.libraries.filter(isLibraryState) : []);
          setError("");
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "资料库加载失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  async function createLibrary(kind: LibraryKind) {
    setBusyKind(kind);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/resource-libraries/${kind}`, {
        method: "POST"
      });
      const body = (await response.json().catch(() => null)) as { library?: unknown; error?: string } | null;
      if (!response.ok) throw new Error(body?.error || "资料库创建失败");
      if (!isLibraryState(body?.library)) throw new Error("资料库创建结果无效");
      setLibraries((current) => [
        ...current.filter((item) => item.kind !== kind),
        body.library as LibraryState
      ]);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "资料库创建失败");
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        {libraryDefinitions.map((definition) => {
          const library = libraries.find((item) => item.kind === definition.kind);
          const Icon = definition.icon;
          const creating = busyKind === definition.kind;
          return (
            <article key={definition.kind} className="flex min-h-56 flex-col rounded-2xl border border-slate-100 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#A8402F] shadow-sm">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                {loading ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs text-slate-400">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    读取中
                  </span>
                ) : library?.folderId ? (
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-500">
                    {library.count > 0 ? `${library.count} 项` : "暂无资料"}
                  </span>
                ) : null}
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{definition.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-slate-500">{definition.description}</p>
              {library?.folderId ? (
                <LinkButton
                  href={`/space/courses/${courseId}/drive?parentId=${encodeURIComponent(library.folderId)}`}
                  variant="secondary"
                  className="mt-4 w-full"
                >
                  进入
                </LinkButton>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-4 w-full"
                  disabled={loading || busyKind !== null}
                  onClick={() => void createLibrary(definition.kind)}
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {creating ? "创建中" : "创建"}
                </Button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
