import { readSession } from "@/lib/auth/session";
import { CreditPurchaseError } from "@/lib/domain/credit-purchases";
import { privateCreditResponse } from "@/lib/http/participation-credit-response";
import { creditPurchaseResponseError, readCreditPurchaseJson } from "@/lib/http/credit-purchase-response";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { createCreditPurchase, readCreditPurchases } from "@/lib/services/credit-purchases";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) return privateCreditResponse({ error: "unauthorized" }, 401);
    if (session.subjectType !== "user") return privateCreditResponse({ error: "PARTICIPATION_ACCOUNT_REQUIRED" }, 403);
    const values = new URL(request.url).searchParams.getAll("communityId");
    if (values.length > 1) throw new CreditPurchaseError("Choose one community", 400, "INVALID_PURCHASE_INPUT");
    return privateCreditResponse(await readCreditPurchases(session.userId, values[0]));
  } catch (error) { return creditPurchaseResponseError(error); }
}

export async function POST(request: Request) {
  if (rejectIfUntrustedWriteOrigin(request)) return privateCreditResponse({ error: "forbidden_origin" }, 403);
  try {
    const session = await readSession();
    if (!session) return privateCreditResponse({ error: "unauthorized" }, 401);
    if (session.subjectType !== "user") return privateCreditResponse({ error: "PARTICIPATION_ACCOUNT_REQUIRED" }, 403);
    return privateCreditResponse({ purchase: await createCreditPurchase(session.userId, await readCreditPurchaseJson(request)) }, 201);
  } catch (error) { return creditPurchaseResponseError(error); }
}
