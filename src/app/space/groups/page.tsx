import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { GroupWorkspace } from "@/components/modules/GroupWorkspace";

export default async function GroupsPage() {
  const user = await requireUser();
  const groups = await db.group.findMany({
    where: { OR: [{ isOpen: true }, { members: { some: { userId: user.id } } }] },
    include: { members: true, posts: { include: { comments: true }, orderBy: { createdAt: "desc" } }, files: true },
    orderBy: { updatedAt: "desc" }
  });
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">小组</h1><GroupWorkspace groups={groups} /></div>;
}
