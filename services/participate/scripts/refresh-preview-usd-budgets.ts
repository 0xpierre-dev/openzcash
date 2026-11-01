import { db } from "../lib/db";
import { getPollOptionEntries } from "../lib/domain/options";
import { proposalContentHash, PROPOSAL_CONTENT_HASH_VERSION } from "../lib/domain/proposal-content";
import { parseProposalUsdCents, PROPOSAL_SETTLEMENT_LABEL } from "../lib/domain/proposal-funding";

// Illustrative budgets for the existing disposable preview. This is NOT a
// currency conversion or a migration of real/anchored proposals.
if (process.env.DATABASE_URL !== "postgresql://dao_test@127.0.0.1:55438/community_workspace"
    || process.env.WORKSPACE_PREVIEW !== "true" || process.env.NODE_ENV === "production") {
  throw new Error("USD sample refresh requires the dedicated local preview database");
}

const samples = [
  { title: "Fund the next community learning circle", oldZat: 350000000n, oldText: "3.5 ZEC", usd: "350.00", text: "350 USD" },
  { title: "Bring the community together for our next meetup", oldZat: 1800000000n, oldText: "18 ZEC", usd: "1800.00", text: "1,800 USD" },
  { title: "Keep our shared community tools running", oldZat: 600000000n, oldText: "6 ZEC", usd: "600.00", text: "600 USD" },
  { title: "Support a hands-on privacy workshop", oldZat: 2400000000n, oldText: "24 ZEC", usd: "2400.00", text: "2,400 USD" }
];

async function refresh() {
  const changed = await db.$transaction(async tx => {
    let count = 0;
    for (const sample of samples) {
      const matches = await tx.poll.findMany({ where: {
        communityId: "preview_orchard", createdById: "preview_maya", question: sample.title
      }, include: { _count: { select: { tickets: true, receipts: true, invites: true, assignments: true } } } });
      if (!matches.length) continue;
      if (matches.length !== 1) throw new Error("Ambiguous preview fixture");
      const poll = matches[0];
      if (poll.requestedAmountUsdCents !== null) continue;
      if (poll.anchorTxid || poll.anchorHeight !== null || Object.values(poll._count).some(count => count > 0)
          || !poll.treasuryId || poll.requestedAmountZat !== sample.oldZat || !poll.proposalBody?.includes(sample.oldText)) {
        throw new Error("Preview fixture has voting activity or changed funding; leaving all samples untouched");
      }
      const body = `${poll.proposalBody.replace(sample.oldText, sample.text)}\n\n${PROPOSAL_SETTLEMENT_LABEL}`;
      const requestedAmountUsdCents = parseProposalUsdCents(sample.usd);
      // Only unanchored, unused sample states are reset inside this transaction;
      // the original illustrative status and all existing URLs are preserved.
      await tx.poll.update({ where: { id: poll.id }, data: { status: "DRAFT" } });
      await tx.poll.update({ where: { id: poll.id }, data: {
        proposalBody: body, requestedAmountZat: null, requestedAmountUsdCents,
        contentHashVersion: PROPOSAL_CONTENT_HASH_VERSION,
        questionHash: proposalContentHash({ communityId: "preview_orchard", title: poll.question, body,
          tags: poll.proposalTags, optionLabels: getPollOptionEntries(poll).map(option => option.label),
          treasuryId: poll.treasuryId, requestedAmountZat: null, requestedAmountUsdCents }),
        status: poll.status
      } });
      count++;
    }
    return count;
  }, { isolationLevel: "Serializable" });
  console.log(`Updated ${changed} unused sample budgets in USD. No exchange rate, funds or payments created.`);
}

refresh().finally(() => db.$disconnect());
