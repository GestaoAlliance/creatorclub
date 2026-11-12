"use server";

import { can } from "@/lib/auth/permissions";
import { currentActor } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { orderDetail } from "@/lib/sales/list";
import { staffContext } from "@/lib/staff/context";

/** D-SALESREVIEW: o pedido no painel lateral (só quem vê dinheiro na marca do topo). */
export async function orderDetailAction(orderId: string) {
  const actor = await currentActor();
  const brand = actor ? (await staffContext(actor)).brand : null;
  if (!actor || !brand || !can(actor.grants, "money.view", brand.id)) return null;
  return orderDetail(db(), brand.id, orderId);
}
