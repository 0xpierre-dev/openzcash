import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CreditPurchaseError } from "@/lib/domain/credit-purchases";
import { privateCreditResponse } from "@/lib/http/participation-credit-response";
import { creditPurchaseResponseError, readCreditPurchaseJson } from "@/lib/http/credit-purchase-response";
import { reconcileCreditPurchases } from "@/lib/services/credit-purchases";

export async function POST(request: Request) {
  const configured = process.env.CREDIT_RECONCILE_SECRET;
  if (!configured || configured.length < 32) return privateCreditResponse({ error: "CREDIT_RECONCILE_UNAVAILABLE" }, 503);
  const supplied = request.headers.get("x-credit-reconcile-secret") ?? "";
  const expected = Buffer.from(configured);
  const candidate = Buffer.from(supplied);
  if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) return privateCreditResponse({ error: "forbidden" }, 403);
  try {
    if (!z.object({}).strict().safeParse(await readCreditPurchaseJson(request)).success) throw new CreditPurchaseError("Reconciliation accepts no payment evidence", 400, "INVALID_PURCHASE_INPUT");
    return privateCreditResponse(await reconcileCreditPurchases());
  } catch (error) { return creditPurchaseResponseError(error); }
}
