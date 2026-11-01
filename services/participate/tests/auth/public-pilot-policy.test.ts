// @vitest-environment node
import { isPublicPilotCommittee, isVerifiedPilotAccount, publicPilotScope } from "@/lib/auth/public-pilot-policy";
import { committeeOperationsEnabled } from "@/lib/auth/committee-policy";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true");
  vi.stubEnv("PARTICIPATE_COMMUNITY_ID", "host");
  vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", "committee");
  vi.stubEnv("APP_BASE_URL", "https://participate.example.org");
});
afterEach(() => vi.unstubAllEnvs());

it("requires explicit, distinct scopes and a secure production origin", () => {
  expect(publicPilotScope()).toEqual({ hostId: "host", committeeId: "committee" });
  expect(isPublicPilotCommittee({ id: "committee", kind: "COMMITTEE" })).toBe(true);
  expect(isPublicPilotCommittee({ id: "committee", kind: "DAO" })).toBe(false);
  expect(isPublicPilotCommittee({ id: "other", kind: "COMMITTEE" })).toBe(false);
  vi.stubEnv("PARTICIPATE_DEMO_COMMITTEE_ID", "host");
  expect(publicPilotScope()).toBeNull();
});
it.each(["", "http://participate.example.org", "https://localhost", "https://127.0.0.1", "https://user:password@example.org"])("does not activate against %s", origin => {
  vi.stubEnv("APP_BASE_URL", origin);
  expect(publicPilotScope()).toBeNull();
});
it("requires a verified personal account and keeps live committee operations off", () => {
  expect(isVerifiedPilotAccount({ id: "user", email: "test@example.org", emailVerifiedAt: new Date() })).toBe(true);
  expect(isVerifiedPilotAccount({ id: "user", email: "test@example.org", emailVerifiedAt: null })).toBe(false);
  expect(isVerifiedPilotAccount({ id: "preview_participant", email: "test@example.org", emailVerifiedAt: new Date() })).toBe(false);
  vi.stubEnv("PARTICIPATE_COMMITTEE_ENABLED", "true");
  expect(committeeOperationsEnabled()).toBe(false);
  vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "false");
  expect(publicPilotScope()).toBeNull();
  expect(committeeOperationsEnabled()).toBe(true);
});
