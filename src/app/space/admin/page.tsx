import { redirect } from "next/navigation";
import { AdminCenter } from "@/components/admin/AdminCenter";
import { requireUser } from "@/lib/auth";
import { isAdministrator } from "@/lib/permissions";

export default async function AdminPage() {
  const user = await requireUser();
  if (!isAdministrator(user)) redirect("/space");
  return <AdminCenter />;
}
