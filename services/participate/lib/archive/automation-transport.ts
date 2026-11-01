import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { digestSchema } from "./format";

const execute = promisify(execFile);
export const signerReplySchema = z.object({
  state: z.enum(["BROADCAST", "RETRY", "NEEDS_REVIEW"]), root: digestSchema,
  pool: z.literal("ironwood").optional(),
  txid: digestSchema.optional(), feeZat: z.number().int().positive().max(50_000).optional(),
  code: z.string().regex(/^[A-Z0-9_]{1,80}$/).optional()
}).strict();
export type SignerReply = z.infer<typeof signerReplySchema>;
export type AnchorRequest = { root: string; memo: string; receiver: string; pool: "ironwood" } & ({ manifestHashes: string[]; eventHashes?: never } | { eventHashes: string[]; manifestHashes?: never });
export type AutomationTransport = { anchor: (request: AnchorRequest) => Promise<SignerReply>; fetcher: typeof fetch };
export class AutomationTransportError extends Error { constructor(readonly code: string) { super(code); } }

/** A forced-command SSH key can call only the node's pinned archive service. */
export function createAutomationTransport(host: string, keyPath: string): AutomationTransport {
  if (!/^[a-z_][a-z0-9_-]*@[a-zA-Z0-9.-]+$/.test(host) || !keyPath.startsWith("/") || keyPath.includes("\n")) throw new AutomationTransportError("SIGNER_CONFIGURATION_INVALID");
  async function call(payload: unknown, timeout: number, signal?: AbortSignal) {
    try {
      // execFile has no stdin option: stream JSON only after the process is created.
      const promise = execute("ssh", ["-i", keyPath, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=10", host, "participate-archive-v1"],
        { timeout, maxBuffer: 4 * 1024 * 1024, encoding: "utf8", signal });
      promise.child.stdin?.end(JSON.stringify(payload));
      const result = await promise;
      return JSON.parse(result.stdout);
    } catch { throw new AutomationTransportError("SIGNER_UNAVAILABLE"); }
  }
  return {
    async anchor(request) {
      // Do not allow an older caller to silently use the historical Sapling path.
      if (request.pool !== "ironwood") throw new AutomationTransportError("SIGNER_IRONWOOD_REQUIRED");
      const reply = signerReplySchema.parse(await call({ action: "anchor", ...request }, 1_200_000));
      if (reply.root !== request.root || reply.state === "BROADCAST" && (!reply.txid || !reply.feeZat || reply.pool !== "ironwood")) throw new AutomationTransportError("SIGNER_RESPONSE_MISMATCH");
      return reply;
    },
    fetcher: async (input, init) => {
      const url = new URL(String(input)), port = Number(url.port);
      if (url.hostname !== "127.0.0.1" || ![28248, 8232].includes(port)) throw new AutomationTransportError("READER_CONFIGURATION_INVALID");
      const reply = await call({ action: "read", port, body: JSON.parse(String(init?.body)) }, 20_000, init?.signal ?? undefined);
      return Response.json(reply);
    }
  };
}
