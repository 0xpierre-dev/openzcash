import { render, screen, fireEvent } from "@testing-library/react";
import bundle from "@/data/archive-pilot/zcg-graphsense-2026-09-28-r1.json";

const mocks = vi.hoisted(() => ({ context: vi.fn(), revision: vi.fn(), discussion: vi.fn(), notFound: vi.fn(() => { throw new Error("NOT_FOUND"); }) }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/services/workspace", () => ({ readBrowsingWorkspaceContext: mocks.context }));
vi.mock("@/lib/services/proposal-archives", () => ({ readArchiveRevision: mocks.revision }));
vi.mock("@/lib/services/archive-discussion", () => ({ readArchiveDiscussion: mocks.discussion }));
vi.mock("@/components/community-workspace", () => ({ WorkspaceFrame: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/workspace-auth", () => ({ WorkspaceSignInButton: ({ next, label }: { next: string; label?: string }) => <button data-next={next}>{label ?? "Sign in"}</button> }));
vi.mock("@/components/proposal-discussion", () => ({ ProposalDiscussion: ({ commentsEndpoint }: { commentsEndpoint: string }) => <section aria-label="Discussion" data-endpoint={commentsEndpoint} /> }));
import ArchivePage from "@/app/communities/[communityId]/archives/[recordId]/page";

const manifest = JSON.parse(bundle.manifest);
const path = `/communities/dao-a/archives/${manifest.recordId}`;
function fixture(revision = 1) {
  return { bundle, manifest: { ...manifest, revision }, manifestHash: "a".repeat(64), revision, anchors: [],
    archive: { id: "record-a", revisions: [{ revision: 2, createdAt: new Date("2026-10-10T00:00:00Z") }, { revision: 1, createdAt: new Date("2026-10-09T00:00:00Z") }] } };
}
const page = (revision?: string) => ArchivePage({ params: Promise.resolve({ communityId: "dao-a", recordId: manifest.recordId }), searchParams: Promise.resolve({ revision }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.revision.mockResolvedValue(fixture());
  mocks.context.mockResolvedValue({ community: { id: "dao-a" }, communities: [], viewer: null, session: null });
  mocks.discussion.mockResolvedValue({ comments: [], proposal: { recordId: manifest.recordId, title: manifest.title, likes: 0, commentCount: 0, likedByMe: false, chargedBefore: false }, capabilities: { canPost: false, canReact: false }, policy: { visibility: "PUBLIC", readOnly: false } });
});

it("opens the latest revision by default without requiring sign-in or claiming a chain receipt", async () => {
  mocks.revision.mockResolvedValue(fixture(2)); render(await page());
  expect(mocks.revision).toHaveBeenCalledWith("dao-a", manifest.recordId, undefined);
  expect(screen.getByText("Not anchored")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Download chain receipt/ })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download revision ↓" })).toHaveAttribute("href", expect.stringContaining("/revisions/2"));
});
it("keeps older revisions readable, links the current version and returns sign-in to the selected revision", async () => {
  render(await page("1"));
  expect(screen.getByRole("link", { name: "Read the latest revision →" })).toHaveAttribute("href", path);
  expect(screen.getByRole("button", { name: "Sign in" })).toHaveAttribute("data-next", `${path}?revision=1#discussion`);
  fireEvent.click(screen.getByText("Revision history"));
  expect(screen.getByRole("link", { name: /Revision 1 Published/ })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("region", { name: "Discussion" })).toHaveAttribute("data-endpoint", `/api/communities/dao-a/archives/${manifest.recordId}/comments`);
});
it("rejects an invalid revision before loading community data", async () => {
  await expect(page("10001")).rejects.toThrow("NOT_FOUND");
  expect(mocks.context).not.toHaveBeenCalled(); expect(mocks.revision).not.toHaveBeenCalled();
});
