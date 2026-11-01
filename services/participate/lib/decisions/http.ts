import { Prisma } from "@prisma/client";
import { PasskeyError } from "@/lib/auth/passkey-policy";
import { passkeyFailure, passkeyResponse } from "@/lib/http/passkeys";
import { z } from "zod";

export function decisionFailure(error: unknown) {
  if (error instanceof z.ZodError) return passkeyResponse({ error: "DECISION_INVALID_INPUT" }, 400);
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) return passkeyResponse({ error: "DECISION_REFRESH_REQUIRED" }, 409);
  if (error instanceof PasskeyError) return passkeyFailure(error);
  return passkeyResponse({ error: "DECISION_UNAVAILABLE" }, 503);
}
export const decisionId = z.string().uuid();
export type DecisionRouteContext = { params: Promise<{ communityId: string; recordId: string; roundId: string }> };
