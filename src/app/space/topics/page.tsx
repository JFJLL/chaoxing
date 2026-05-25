import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TopicManager } from "@/components/modules/TopicManager";

export default async function TopicsPage() {
  const user = await requireUser();
  const [folders, topics] = await Promise.all([
    db.topicFolder.findMany({ where: { ownerId: user.id, deletedAt: null }, orderBy: { updatedAt: "desc" } }),
    db.topic.findMany({ where: { ownerId: user.id, deletedAt: null }, orderBy: { updatedAt: "desc" } })
  ]);
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">专题创作</h1><TopicManager folders={folders} topics={topics} /></div>;
}
