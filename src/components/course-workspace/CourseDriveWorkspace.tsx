"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { DriveClient } from "@/components/modules/DriveClient";
import {
  CourseDriveRootSetup,
  type CourseDriveRoot as DriveRoot,
  type CourseDriveRootCandidate as RootCandidate
} from "@/components/course-workspace/CourseDriveRootSetup";

type DriveItem = {
  id: string;
  parentId: string | null;
  name: string;
  kind: string;
  size?: number;
  studentAccess?: "ALLOW" | "DENY";
  courseTitle?: string;
  shares?: Array<{ code: string }>;
  copilotCourses?: Array<{ id: string; title: string }>;
};
type DriveChildren = {
  root: DriveRoot;
  parent: { id: string; name: string } | null;
  breadcrumbs: Array<{ id: string; name: string }>;
  items: DriveItem[];
};
type MoveFolder = { id: string; name: string; parentId: string | null };

async function fetchDriveChildren(courseId: string, initialParentId?: string): Promise<DriveChildren> {
  const query = initialParentId ? `?parentId=${encodeURIComponent(initialParentId)}` : "";
  const response = await fetch(`/api/courses/${courseId}/drive/children${query}`, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as (Partial<DriveChildren> & { error?: string }) | null;
  if (!response.ok || !body?.root || !Array.isArray(body.items) || !Array.isArray(body.breadcrumbs)) {
    throw new Error(body?.error || "文件列表加载失败");
  }
  return {
    root: body.root,
    parent: body.parent ?? null,
    breadcrumbs: body.breadcrumbs,
    items: body.items
  };
}

export async function fetchCourseDriveMoveFolders(courseId: string): Promise<MoveFolder[]> {
  const response = await fetch(`/api/courses/${courseId}/drive-picker`, { cache: "no-store" });
  const body = (await response.json().catch(() => null)) as {
    items?: Array<{ id: string; name: string; kind: string; parentId: string | null }>;
    error?: string;
  } | null;
  if (!response.ok || !Array.isArray(body?.items)) {
    throw new Error(body?.error || "目标文件夹加载失败");
  }
  return body.items
    .filter((item) => item.kind === "folder")
    .map((item) => ({ id: item.id, name: item.name, parentId: item.parentId }));
}

export function CourseDriveWorkspace({
  courseId,
  courseTitle,
  initialParentId
}: {
  courseId: string;
  courseTitle: string;
  initialParentId?: string;
}) {
  const [root, setRoot] = useState<DriveRoot | null>();
  const [folders, setFolders] = useState<RootCandidate[]>([]);
  const [canBindRoot, setCanBindRoot] = useState(false);
  const [children, setChildren] = useState<DriveChildren | null>(null);
  const [moveFolders, setMoveFolders] = useState<MoveFolder[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadRoot() {
      try {
        const response = await fetch(`/api/courses/${courseId}/drive-root`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as {
          root?: DriveRoot | null;
          folders?: RootCandidate[];
          canBindRoot?: boolean;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(body?.error || "课程云盘加载失败");
        if (!cancelled) {
          setRoot(body?.root ?? null);
          setFolders(Array.isArray(body?.folders) ? body.folders : []);
          setCanBindRoot(body?.canBindRoot === true);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "课程云盘加载失败");
      }
    }

    void loadRoot();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (!root) {
      setChildren(null);
      return;
    }
    let cancelled = false;

    async function loadChildren() {
      setError("");
      setChildren(null);
      try {
        const [nextChildren, nextMoveFolders] = await Promise.all([
          fetchDriveChildren(courseId, initialParentId),
          fetchCourseDriveMoveFolders(courseId)
        ]);
        if (!cancelled) {
          setChildren(nextChildren);
          setMoveFolders(nextMoveFolders);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "文件列表加载失败");
      }
    }

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, [courseId, initialParentId, root]);

  if (error && root === undefined) {
    return <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  }

  if (root === undefined) {
    return <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在读取课程云盘</p>;
  }

  if (!root) {
    if (!canBindRoot) {
      return (
        <p role="status" className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-5 text-sm text-amber-800">
          课程云盘尚未绑定，请联系课程所有者完成根目录设置。
        </p>
      );
    }
    return (
      <div className="space-y-3">
        {error ? <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <CourseDriveRootSetup courseId={courseId} folders={folders} onReady={setRoot} />
      </div>
    );
  }

  if (error) {
    return <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  }

  if (!children) {
    return <p role="status" className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />正在加载文件</p>;
  }

  const currentParentId = children.parent?.id ?? root.id;
  const refreshChildren = async () => {
    const [nextChildren, nextMoveFolders] = await Promise.all([
      fetchDriveChildren(courseId, initialParentId),
      fetchCourseDriveMoveFolders(courseId)
    ]);
    setChildren(nextChildren);
    setMoveFolders(nextMoveFolders);
  };

  return (
    <DriveClient
      files={children.items.map((item) => ({ ...item, size: item.size ?? 0 }))}
      folders={[{ id: root.id, name: root.name, parentId: null }, ...moveFolders]}
      courses={[{ id: courseId, title: courseTitle }]}
      canManage
      courseId={courseId}
      onRefresh={refreshChildren}
      parentId={currentParentId}
      breadcrumbs={children.breadcrumbs}
      baseHref={`/space/courses/${courseId}/drive`}
      rootParentId={root.id}
      rootLabel="课程云盘"
    />
  );
}
