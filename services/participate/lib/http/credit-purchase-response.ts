import { CreditPurchaseError } from "@/lib/domain/credit-purchases";
import { ParticipationCreditError } from "@/lib/services/participation-credits";
import { privateCreditResponse, readParticipationJson } from "@/lib/http/participation-credit-response";

export function creditPurchaseResponseError(error: unknown) {
  if (error instanceof CreditPurchaseError) return privateCreditResponse({ error: error.code, message: error.message }, error.status);
  return privateCreditResponse({ error: "CREDIT_PURCHASE_REQUEST_FAILED" }, 500);
}

export async function readCreditPurchaseJson(request: Request) {
  try { return await readParticipationJson(request); }
  catch (error) {
    if (error instanceof ParticipationCreditError) throw new CreditPurchaseError("Submit a valid purchase request as JSON", 400, "INVALID_PURCHASE_INPUT");
    throw error;
  }
}
