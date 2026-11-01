import { z } from "zod";
import { readSession } from "@/lib/auth/session";
import { CreditPurchaseError } from "@/lib/domain/credit-purchases";
import { privateCreditResponse } from "@/lib/http/participation-credit-response";
import { creditPurchaseResponseError, readCreditPurchaseJson } from "@/lib/http/credit-purchase-response";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { checkCreditPurchase } from "@/lib/services/credit-purchases";

export async function POST(request: Request, context: { params: Promise<{ purchaseId: string }> }) {
  if (rejectIfUntrustedWriteOrigin(request)) return privateCreditResponse({ error: "forbidden_origin" }, 403);
  try {
    const session = await readSession();
    if (!session) return privateCreditResponse({ error: "unauthorized" }, 401);
    if (session.subjectType !== "user") return privateCreditResponse({ error: "PARTICIPATION_ACCOUNT_REQUIRED" }, 403);
    if (!z.object({}).strict().safeParse(await readCreditPurchaseJson(request)).success) {
      throw new CreditPurchaseError("Payment evidence must come from the receiving wallet", 400, "INVALID_PURCHASE_INPUT");
    }
    const { purchaseId } = await context.params;
    return privateCreditResponse({ purchase: await checkCreditPurchase(session.userId, purchaseId) });
  } catch (error) { return creditPurchaseResponseError(error); }
}
