import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { NotesClient } from "@/components/modules/NotesClient";

export default async function NotesPage() {
  const user = await requireUser();
  const [notes, courses] = await Promise.all([
    db.note.findMany({ where: { ownerId: user.id, deletedAt: null }, include: { tags: true }, orderBy: { updatedAt: "desc" } }),
    db.course.findMany({ where: { OR: [{ ownerId: user.id }, { enrollments: { some: { userId: user.id } } }] }, orderBy: { title: "asc" } })
  ]);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">笔记</h1><NotesClient notes={notes} courses={courses} /></div>;
}
