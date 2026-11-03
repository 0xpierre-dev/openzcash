import type { NetworkEmission } from "./types";

const SECOND_HALVING_HEIGHT = 2_726_400;
const BLOSSOM_HALVING_BLOCKS = 1_680_000;
// Mainnet deployment and subsidy rules: ZIP 259 and ZIP 218.
const NU7_ACTIVATION_HEIGHT = 3_543_405;
const NU7_SPACING_RATIO = 3;
const BLOSSOM_BASE_SUBSIDY_ZAT = 625_000_000;

type HalvingProjection = Omit<NetworkEmission, "blockSubsidyZec" | "minerSubsidyZec">;
type Observation = {
  height: number;
  time: number;
  targetBlockSeconds: number;
  nu7ActivationHeight?: number | null;
};

export function projectHalving(observation: Observation): HalvingProjection | null {
  const { height, time, targetBlockSeconds, nu7ActivationHeight } = observation;
  if (height < SECOND_HALVING_HEIGHT) return null;
  const nu7 = nu7ActivationHeight === NU7_ACTIVATION_HEIGHT;
  const expectedSpacing = nu7 && height >= NU7_ACTIVATION_HEIGHT ? 25 : 75;
  if (targetBlockSeconds !== expectedSpacing) return null;

  // Integer units preserve ZIP 218's fractional progress through the era at
  // activation. Three post-NU7 blocks replace one pre-NU7 block.
  const ratio = nu7 ? NU7_SPACING_RATIO : 1;
  const elapsedUnits = nu7 && height >= NU7_ACTIVATION_HEIGHT
    ? (NU7_ACTIVATION_HEIGHT - SECOND_HALVING_HEIGHT) * ratio + height - NU7_ACTIVATION_HEIGHT
    : (height - SECOND_HALVING_HEIGHT) * ratio;
  const eraUnits = BLOSSOM_HALVING_BLOCKS * ratio;
  const erasSinceSecond = Math.floor(elapsedUnits / eraUnits);
  const blossomNext = SECOND_HALVING_HEIGHT + (erasSinceSecond + 1) * BLOSSOM_HALVING_BLOCKS;
  // An unrecognized upgrade before the next halving needs verified rules.
  if (!nu7 && nu7ActivationHeight != null && nu7ActivationHeight <= blossomNext) return null;
  const next = nu7
    ? NU7_ACTIVATION_HEIGHT + (blossomNext - NU7_ACTIVATION_HEIGHT) * ratio
    : blossomNext;
  const remaining = next - height;
  // Spacing is selected by the height of the arriving block, including NU7's
  // activation block. Anchor the estimate to the observed block's timestamp.
  const intervalsAt75Seconds = nu7 ? Math.max(0, NU7_ACTIVATION_HEIGHT - 1 - height) : remaining;
  const secondsRemaining = intervalsAt75Seconds * 75 + (remaining - intervalsAt75Seconds) * 25;
  const estimatedAt = new Date((time + secondsRemaining) * 1_000);
  if (!Number.isFinite(estimatedAt.getTime())) return null;
  return {
    halvingSchedule: nu7 ? "nu7" : "blossom",
    nextHalvingHeight: next,
    blocksRemaining: remaining,
    estimatedHalvingAt: estimatedAt.toISOString(),
    eraProgressPercent: elapsedUnits % eraUnits / eraUnits * 100,
    // Scheduled subsidy only: observed minting may also include NSM reissuance.
    nextBlockSubsidyZec: Math.floor(BLOSSOM_BASE_SUBSIDY_ZAT / (ratio * 2 ** (erasSinceSecond + 3))) / 100_000_000,
  };
}
