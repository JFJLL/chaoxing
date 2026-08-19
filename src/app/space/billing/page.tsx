import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getCreditAccountSummary } from "@/lib/billing/credit-service";
import { listRechargeOrders, serializePaymentOrder } from "@/lib/billing/payment-service";
import { BillingCenter } from "@/components/billing/BillingCenter";

export default async function BillingPage() {
  const user = await requireUser();
  if (user.role !== "TEACHER") redirect("/space");
  const [{ account }, orders] = await Promise.all([
    getCreditAccountSummary(user.id),
    listRechargeOrders(user.id)
  ]);
  return <BillingCenter initialAccount={{ available: account.available, reserved: account.reserved }} initialOrders={orders.map(serializePaymentOrder)} />;
}
