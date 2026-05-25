import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ContactsDirectory } from "@/components/modules/ContactsDirectory";

export default async function ContactsPage() {
  const user = await requireUser();
  const contacts = await db.user.findMany({ where: { institutionId: user.institutionId }, include: { institution: true }, orderBy: [{ role: "asc" }, { name: "asc" }] });
  return <div className="space-y-5"><h1 className="text-2xl font-semibold">通讯录</h1><ContactsDirectory contacts={contacts} /></div>;
}
