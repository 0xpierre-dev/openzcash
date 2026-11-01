import { z } from "zod";

/** A prepared recipient is not an active offer and never enables a payment. */
const preparedSchema = z.object({
  communityId: z.string().min(1).max(128),
  operator: z.string().trim().min(1).max(80),
  network: z.literal("mainnet"),
  address: z.string().regex(/^u1[a-z0-9]{40,510}$/),
  accountId: z.string().uuid(),
}).strict();

export function preparedPilotReceiver(communityId: string, encoded = process.env.CREDIT_PILOT_RECEIVER_JSON) {
  if (!encoded || encoded.length > 4096) return null;
  try {
    const result = preparedSchema.safeParse(JSON.parse(encoded));
    return result.success && result.data.communityId === communityId ? result.data : null;
  } catch { return null; }
}

/** Whitelist public metadata. Address and account identity stay server-side until a payable invoice exists. */
export function pilotReceiverNotice(communityId: string) {
  const receiver = preparedPilotReceiver(communityId);
  return receiver ? { operator: receiver.operator, network: receiver.network, state: "preparing" as const } : undefined;
}
