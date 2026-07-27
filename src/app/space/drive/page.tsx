import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTeacher } from "@/lib/permissions";
import { DriveClient } from "@/components/modules/DriveClient";

type PageProps = { searchParams: Promise<{ parentId?: string }> };

export default async function DrivePage({ searchParams }: PageProps) {
  const user = await requireUser();
  const canManage = isTeacher(user);
  if (!canManage) {
    redirect("/space/courses");
  }

  const { parentId: requestedParentId } = await searchParams;
  const parent = requestedParentId ? await db.driveFile.findFirst({ where: { id: requestedParentId, ownerId: user.id, kind: "folder", deletedAt: null } }) : null;
  const parentId = parent?.id ?? null;
  const [files, courses, folders] = await Promise.all([
    db.driveFile.findMany({ where: { ownerId: user.id, parentId, deletedAt: null }, include: { shares: true, rootCourse: { select: { id: true, title: true } } }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.course.findMany({ where: { ownerId: user.id }, orderBy: { title: "asc" } }),
    db.driveFile.findMany({ where: { ownerId: user.id, kind: "folder", deletedAt: null }, select: { id: true, name: true, parentId: true }, orderBy: { name: "asc" } })
  ]);
  const breadcrumbs: Array<{ id: string; name: string }> = [];
  let current = parent;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    breadcrumbs.unshift({ id: current.id, name: current.name });
    current = current.parentId ? await db.driveFile.findFirst({ where: { id: current.parentId, ownerId: user.id, kind: "folder", deletedAt: null } }) : null;
  }
  const displayFiles = files.map((file) => ({ ...file, copilotCourses: file.rootCourse ? [file.rootCourse] : [] }));
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">云盘</h1><DriveClient files={displayFiles} folders={folders} courses={courses} canManage={canManage} parentId={parentId} breadcrumbs={breadcrumbs} /></div>;
}
