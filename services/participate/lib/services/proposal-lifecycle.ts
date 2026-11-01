import { Prisma } from "@prisma/client";
import { verifyActivityEvent } from "@/lib/archive/activity";
import type { ProposalAbandonment } from "@/lib/domain/proposal-submission";

export const abandonmentInclude = { event: true } as const;
type Row = Prisma.ProposalAbandonmentGetPayload<{ include: typeof abandonmentInclude }>;

export const isLifecycleConflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError
  && (error.code === "P2034" || (error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code))));

export async function abandonmentView(row: Row | null | undefined): Promise<ProposalAbandonment | null> {
  if (!row) return null;
  const event = await verifyActivityEvent(row.event.eventJson, row.event.eventHash);
  if (event.kind !== "PROPOSAL_ABANDONED" || event.id !== row.eventId) throw new Error("Invalid abandonment record");
  return { eventId: event.id, eventHash: row.event.eventHash, reason: event.reason, occurredAt: event.occurredAt };
}

// The author updates this row when abandoning. A concurrent review transaction
// either finishes first or fails serialization; stale snapshots cannot sign after it.
export async function lockProposalArchive(tx: Prisma.TransactionClient, archiveId: string) {
  await tx.$queryRaw`SELECT "id" FROM "ProposalArchive" WHERE "id" = ${archiveId} FOR UPDATE`;
}
