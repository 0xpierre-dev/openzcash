// @vitest-environment node
const mocks = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, communityMembership: { findFirst: vi.fn() }, sandbox: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: mocks }));
vi.mock("@/lib/services/participation-credits", () => ({ isParticipationCreditSandbox: mocks.sandbox }));
import { signInToDemo } from "@/lib/services/email-auth";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("NODE_ENV", "test"); mocks.sandbox.mockReturnValue(true);
  mocks.user.findUnique.mockImplementation(async ({ where }) => ({ id: where.id, nick: "test.preview", status: "ACTIVE", role: "USER" }));
  mocks.communityMembership.findFirst.mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

it("never offers a shared persona in the public pilot, including a local rehearsal", async () => {
  vi.stubEnv("PARTICIPATE_PUBLIC_DEMO", "true");
  await expect(signInToDemo()).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
  expect(mocks.user.findUnique).not.toHaveBeenCalled();
});

it("defaults to the participant account with no committee authority", async () => {
  expect(await signInToDemo()).toMatchObject({ userId: "preview_participant", role: "USER" });
  expect(mocks.communityMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "preview_participant", status: "ACTIVE" } }));
});
it("rejects the former committee persona before looking up or issuing its account", async () => {
  await expect(signInToDemo("committee")).rejects.toMatchObject({ code: "COMMITTEE_ADMIN_REQUIRED", status: 403 });
  expect(mocks.user.findUnique).not.toHaveBeenCalled();
});
it("fails closed when a participant fixture has acquired committee or management access", async () => {
  mocks.communityMembership.findFirst.mockResolvedValue({ id: "unexpected-membership" });
  await expect(signInToDemo()).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
});
it.each([null, { status: "DISABLED", role: "USER" }])("does not restore a missing or disabled account", async user => {
  mocks.user.findUnique.mockResolvedValue(user);
  await expect(signInToDemo()).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
});
it.each(["production", "outside-sandbox"])("blocks both personas in %s", async environment => {
  if (environment === "production") vi.stubEnv("NODE_ENV", "production"); else mocks.sandbox.mockReturnValue(false);
  for (const persona of ["participant", "committee"] as const) await expect(signInToDemo(persona)).rejects.toMatchObject({ code: "DEMO_UNAVAILABLE" });
  expect(mocks.user.findUnique).not.toHaveBeenCalled();
});
