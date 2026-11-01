import { expect, it } from "vitest";
import { parsePollUtcInput } from "@/lib/domain/poll-form";

it("keeps UTC independent of the host zone", () => {
  expect(parsePollUtcInput("2026-11-01T10:30")).toBe("2026-11-01T10:30:00.000Z");
});
it.each(["", "2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01T24:30", "2026-01-01T10:00-03:00", "not-a-date"])("rejects invalid or ambiguous UTC input %s", value => {
  expect(parsePollUtcInput(value)).toBeNull();
});
