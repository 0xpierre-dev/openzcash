import { describe, expect, it } from "vitest";
import { projectHalving } from "./halving";

const time = Date.parse("2026-11-03T00:00:00Z") / 1_000;
const activation = 3_543_405;
const thirdHalving = 6_132_390;
const observation = { height: 3_539_856, time, targetBlockSeconds: 75, nu7ActivationHeight: activation };

describe("Mainnet halving projection", () => {
  it("includes the scheduled NU7 transition before activation", () => {
    const projection = projectHalving(observation);
    expect(projection).toMatchObject({
      halvingSchedule: "nu7", nextHalvingHeight: thirdHalving,
      blocksRemaining: 2_592_534, nextBlockSubsidyZec: 0.26041666,
      estimatedHalvingAt: new Date((time + 3_548 * 75 + 2_588_986 * 25) * 1_000).toISOString(),
    });
    expect(projection?.eraProgressPercent).toBeCloseTo(48.42, 2);
  });

  it.each([
    [activation - 2, 75, 75 + 2_588_986 * 25],
    [activation - 1, 75, 2_588_986 * 25],
    [activation, 25, 2_588_985 * 25],
    [activation + 1, 25, 2_588_984 * 25],
  ])("uses the arriving block's spacing at height %i", (height, targetBlockSeconds, secondsRemaining) => {
    const projection = projectHalving({ ...observation, height, targetBlockSeconds });
    expect(projection).toMatchObject({
      nextHalvingHeight: thirdHalving, blocksRemaining: thirdHalving - height,
      nextBlockSubsidyZec: 0.26041666,
      estimatedHalvingAt: new Date((time + secondsRemaining) * 1_000).toISOString(),
    });
    expect(projection?.eraProgressPercent).toBeCloseTo(48.63, 2);
  });

  it.each([
    [thirdHalving - 1, thirdHalving, 1, 0.26041666],
    [thirdHalving, 11_172_390, 5_040_000, 0.13020833],
    [11_172_389, 11_172_390, 1, 0.13020833],
    [11_172_390, 16_212_390, 5_040_000, 0.06510416],
  ])("preserves discrete halvings and zatoshi rounding at height %i", (height, next, remaining, subsidy) => {
    const projection = projectHalving({ ...observation, height, targetBlockSeconds: 25 });
    expect(projection).toMatchObject({
      nextHalvingHeight: next, blocksRemaining: remaining, nextBlockSubsidyZec: subsidy,
      estimatedHalvingAt: new Date((time + remaining * 25) * 1_000).toISOString(),
    });
    expect(projection?.eraProgressPercent).toBeCloseTo(remaining === 1 ? 100 : 0, 3);
  });

  it.each([
    { nu7ActivationHeight: activation + 1 },
    { nu7ActivationHeight: 0 },
    { targetBlockSeconds: 25 },
    { height: activation, targetBlockSeconds: 75 },
    { height: activation, targetBlockSeconds: 25, nu7ActivationHeight: null },
    { height: 2_726_399 },
    { targetBlockSeconds: 20 },
  ])("withholds an unverified schedule or inconsistent source: %j", (overrides) => {
    expect(projectHalving({ ...observation, ...overrides })).toBeNull();
  });

  it("keeps the legacy schedule when no NU7 transition is reported", () => {
    expect(projectHalving({ ...observation, nu7ActivationHeight: null })).toMatchObject({
      halvingSchedule: "blossom", nextHalvingHeight: 4_406_400,
      blocksRemaining: 866_544, nextBlockSubsidyZec: 0.78125,
      estimatedHalvingAt: new Date((time + 866_544 * 75) * 1_000).toISOString(),
    });
  });
});
