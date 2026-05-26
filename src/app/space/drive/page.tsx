import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { DriveClient } from "@/components/modules/DriveClient";

export default async function DrivePage() {
  const user = await requireUser();
  const [files, courses] = await Promise.all([
    db.driveFile.findMany({ where: { ownerId: user.id, parentId: null, deletedAt: null }, include: { shares: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    db.course.findMany({ where: { ownerId: user.id }, orderBy: { title: "asc" } })
  ]);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">云盘</h1><DriveClient files={files} courses={courses} /></div>;
}
