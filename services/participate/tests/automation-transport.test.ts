// @vitest-environment node
import { createAutomationTransport, signerReplySchema, type AnchorRequest } from "@/lib/archive/automation-transport";

describe("Ironwood-only automatic signer transport", () => {
  it.each([undefined, "sapling", "orchard"])("rejects pool %s before starting SSH", async pool => {
    const transport = createAutomationTransport("archive@127.0.0.1", "/no-key-must-be-read");
    await expect(transport.anchor({ root: "a".repeat(64), memo: "unused", receiver: "unused", manifestHashes: [], pool } as unknown as AnchorRequest))
      .rejects.toMatchObject({ code: "SIGNER_IRONWOOD_REQUIRED" });
  });

  it("never accepts a signer that identifies an old shielded pool", () => {
    for (const pool of ["sapling", "orchard"]) expect(signerReplySchema.safeParse({ state: "BROADCAST", pool, root: "a".repeat(64), txid: "b".repeat(64), feeZat: 30000 }).success).toBe(false);
    expect(signerReplySchema.safeParse({ state: "BROADCAST", pool: "ironwood", root: "a".repeat(64), txid: "b".repeat(64), feeZat: 30000 }).success).toBe(true);
  });
});
