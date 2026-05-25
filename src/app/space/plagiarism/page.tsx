import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PlagiarismClient } from "@/components/modules/PlagiarismClient";

export default async function PlagiarismPage() {
  const user = await requireUser();
  const checks = await db.plagiarismCheck.findMany({ where: { ownerId: user.id }, orderBy: { createdAt: "desc" } });
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">论文检测</h1><PlagiarismClient checks={checks} /></div>;
}
