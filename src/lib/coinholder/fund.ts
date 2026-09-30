import {
  BLOCKS_PER_DAY,
  LOCKBOX_ZEC_PER_BLOCK,
  THIRD_HALVING_HEIGHT,
  lockboxZecAt,
} from "@/lib/zcash/lockbox";

/** NU6.1: the ZIP 1015 lockbox was paid into the Coinholder-Controlled Fund at this height (ZIP 271). */
export const NU6_1_HEIGHT = 3_146_400;

/** Fund arithmetic from the protocol schedule; every input is a height, a ZEC balance or a USD price. */
export function fundOutlook(input: {
  balanceZec: number;
  height: number;
  priceUsd: number | null;
  approvedUsd: number;
  now: Date;
}) {
  const { balanceZec, height, priceUsd, approvedUsd, now } = input;
  const perDay = LOCKBOX_ZEC_PER_BLOCK * BLOCKS_PER_DAY;
  const blocksLeft = Math.max(0, THIRD_HALVING_HEIGHT - height);
  const streamLeftZec = blocksLeft * LOCKBOX_ZEC_PER_BLOCK;
  const streamTotalZec =
    (THIRD_HALVING_HEIGHT - NU6_1_HEIGHT) * LOCKBOX_ZEC_PER_BLOCK;
  const streamDoneShare = Math.min(
    1,
    Math.max(
      0,
      (height - NU6_1_HEIGHT) / (THIRD_HALVING_HEIGHT - NU6_1_HEIGHT),
    ),
  );
  const halvingEta = new Date(
    now.getTime() + (blocksLeft / BLOCKS_PER_DAY) * 86_400_000,
  );
  const approvedZec = priceUsd ? approvedUsd / priceUsd : null;
  return {
    seedZec: lockboxZecAt(NU6_1_HEIGHT),
    perBlockZec: LOCKBOX_ZEC_PER_BLOCK,
    perDayZec: perDay,
    perMonthZec: perDay * 30,
    blocksLeft,
    streamLeftZec,
    streamTotalZec,
    streamDoneShare,
    halvingEta,
    balanceUsd: priceUsd ? balanceZec * priceUsd : null,
    approvedZec,
    /** Approved but unpaid grants as a share of today's balance, at today's price. */
    approvedShareOfBalance:
      approvedZec !== null && balanceZec > 0 ? approvedZec / balanceZec : null,
    balanceAfterApprovedZec:
      approvedZec !== null ? balanceZec - approvedZec : null,
  };
}
