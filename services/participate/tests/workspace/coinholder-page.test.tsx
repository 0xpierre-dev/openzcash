import { beforeEach, describe, expect, it, vi } from "vitest";

const { context, dashboard } = vi.hoisted(() => ({ context: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/lib/services/workspace", () => ({ readBrowsingWorkspaceContext: context }));
vi.mock("@/lib/services/coinholder", () => ({ readCoinholderDashboard: dashboard }));
vi.mock("@/components/coinholder-dashboard", () => ({ CoinholderWorkspace: () => null }));
import CoinholderPage from "@/app/communities/[communityId]/coinholder/page";

const community = { id: "dao-a", name: "Community A", slug: "community-a" };
const workspace = { community, communities: [community], viewer: { nick: "Owner", role: "OWNER" } };
const results = { round: { id: "q3-2026" } };
const call = () => CoinholderPage({ params: Promise.resolve({ communityId: "dao-a" }) });

beforeEach(() => {
  vi.clearAllMocks();
  context.mockResolvedValue(workspace);
  dashboard.mockResolvedValue(results);
});

describe("Coinholder page access", () => {
  it("authorizes the community before loading the public sources", async () => {
    const page = await call();
    expect(context).toHaveBeenCalledWith("dao-a");
    expect(context.mock.invocationCallOrder[0]).toBeLessThan(dashboard.mock.invocationCallOrder[0]);
    expect(page.props).toMatchObject({ ...workspace, initialData: results });
    expect(page.key).toBe("dao-a");
  });

  it("renders an anonymous public workspace without introducing a login redirect", async () => {
    context.mockResolvedValue({ ...workspace, viewer: null, session: null, canManage: false });
    const page = await call();
    expect(page.props.viewer).toBeNull();
    expect(page.props.initialData).toEqual(results);
  });

  it("does not fetch sources when workspace access is denied", async () => {
    context.mockRejectedValue(new Error("NOT_FOUND"));
    await expect(call()).rejects.toThrow("NOT_FOUND");
    expect(dashboard).not.toHaveBeenCalled();
  });
});
