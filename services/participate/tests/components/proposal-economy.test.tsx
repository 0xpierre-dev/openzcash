import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProposalEconomyProvider, ProposalEconomyNotice, ProposalEngagement } from "@/components/proposal-economy";
import { ProposalWorkspace } from "@/components/proposal-workspace";
import type { ProposalParticipationBoard } from "@/lib/domain/proposal-participation";
import { ZCG_PROPOSAL_EXAMPLES } from "@/lib/data/zcg-proposal-examples";
import { EMPTY_SUBMISSION, type SubmissionDraft } from "@/lib/domain/proposal-submission";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/workspace-account", () => ({ WorkspaceAccount: () => <button>Account</button> }));
vi.mock("@/components/workspace-auth", () => ({ WorkspaceSignInButton: ({ label }: { label?: string }) => <button>{label ?? "Sign in"}</button> }));
const community = { id: "public-a", name: "Public records", slug: "public-a" };
const record = ZCG_PROPOSAL_EXAMPLES[0].id;
const board: ProposalParticipationBoard = { canParticipate: true,
  participation: { communityId: community.id, mode: "CREDITS", commentCost: 2, reactionCost: 1, version: 2, availableCredits: 25, sandbox: true, sponsored: false },
  proposals: [{ recordId: record, title: "GraphSense", likes: 0, commentCount: 3, likedByMe: false, chargedBefore: false }] };
const response = (body: unknown, status = 200) => ({ ok: status < 400, json: async () => body });
function renderEconomy(value = board) { return render(<ProposalEconomyProvider communityId={community.id} initial={value}><ProposalEconomyNotice /><ProposalEngagement recordId={record} /></ProposalEconomyProvider>); }
afterEach(() => vi.unstubAllGlobals());

it("keeps author actions private and routes abandoned native proposals to the correct filter", () => {
  const mine: SubmissionDraft = { id: "078b0fc7-ae08-4fbf-ac40-6224f23613b4", payload: EMPTY_SUBMISSION, version: 1, contentHash: "a".repeat(64), state: "PUBLISHED_DEMO", recordId: "pilot-mine", updatedAt: "2026-10-10T00:00:00Z" };
  const abandoned = { eventId: "event", eventHash: "a".repeat(64), reason: "The author withdrew the delivery plan.", occurredAt: "2026-10-10T12:00:00.000Z" };
  const native = (recordId: string, title: string) => ({ ...board.proposals[0], recordId, title });
  const view = render(<ProposalWorkspace community={community} communities={[community]} viewer={null} drafts={[mine]} board={{ ...board, proposals: [board.proposals[0], native("pilot-mine", "My published proposal"), native("pilot-other", "Another author's proposal"), { ...native("pilot-stopped", "Withdrawn pilot proposal"), abandonment: abandoned }] }} />);
  expect(screen.getAllByRole("button", { name: "Abandon proposal" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Abandoned" }));
  expect(screen.getByRole("button", { name: "Withdrawn pilot proposal" })).toBeInTheDocument();
  expect(screen.getByText(abandoned.reason)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "My published proposal" })).not.toBeInTheDocument();
  expect(screen.queryByText("No abandoned proposals.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Approved" }));
  expect(screen.queryByRole("button", { name: "Withdrawn pilot proposal" })).not.toBeInTheDocument();
  view.unmount();
  render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={{ ...board, proposals: [native("pilot-mine", "My published proposal")] }} />);
  expect(screen.queryByRole("button", { name: "Abandon proposal" })).not.toBeInTheDocument();
});

it("discloses the price of a like without showing an account balance", () => {
  renderEconomy();
  expect(screen.queryByText("25 Zcred")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" })).toBeEnabled();
  expect(screen.getByRole("link", { name: /3 comments/ })).toHaveAttribute("href", expect.stringContaining(`${record}#discussion`));
});
it("keeps visitors public without revealing balances or offering a paid write before sign-in", () => {
  renderEconomy({ ...board, canParticipate: false, participation: { ...board.participation!, availableCredits: null } });
  expect(screen.getByRole("button", { name: "♡ Like · 0 · 1 Zcred" })).toBeInTheDocument();
  expect(screen.queryByText("25 Zcred")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Like · 0 · 1 Zcred" })).not.toBeInTheDocument();
});
it("preserves the request key through an interrupted like and updates the confirmed balance", async () => {
  const next = { ...board, participation: { ...board.participation!, availableCredits: 24 }, proposals: [{ ...board.proposals[0], likes: 1, likedByMe: true, chargedBefore: true }] };
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("connection interrupted")).mockResolvedValueOnce(response({ proposal: next.proposals[0], participation: next.participation })).mockResolvedValue(response({ board: next }));
  vi.stubGlobal("fetch", fetcher); renderEconomy();
  fireEvent.click(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" })).toHaveAttribute("aria-busy", "false");
  fireEvent.click(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Unlike · 1" })).toBeEnabled());
  expect(screen.getByRole("button", { name: "Unlike · 1" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Unlike · 1" })).toHaveAttribute("aria-busy", "false");
  const bodies = fetcher.mock.calls.filter(([, options]) => options?.method === "POST").map(([, options]) => JSON.parse(options.body));
  expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]); expect(bodies[0].policyVersion).toBe(2);
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/participation"))).toHaveLength(0);
  expect(screen.queryByText("24 Zcred")).not.toBeInTheDocument();
});
it("shows a proposal like at once and rolls it back if the server rejects it", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  const fetcher = vi.fn(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher); renderEconomy();
  fireEvent.click(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" }));
  const pending = screen.getByRole("button", { name: "Unlike · 1" });
  expect(pending).toHaveAttribute("aria-pressed", "true");
  expect(pending).toHaveAttribute("aria-busy", "true");
  expect(pending).toHaveStyle({ opacity: "1" });
  expect(within(pending).getByText("1")).toBeVisible();
  fireEvent.click(pending);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => finish(response({ error: "REACTION_RATE_LIMIT" }, 429)));
  expect(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" })).toHaveAttribute("aria-busy", "false");
  expect(screen.getByRole("alert")).toHaveTextContent("Please wait a minute");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("marks only the saving proposal busy while preserving the credit write lock and comment access", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  const other = { ...board.proposals[0], recordId: "other-record", likes: 2 };
  const next = { ...board.proposals[0], likes: 1, likedByMe: true, chargedBefore: true };
  const fetcher = vi.fn(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
  const openComments = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  render(<ProposalEconomyProvider communityId={community.id} initial={{ ...board, proposals: [board.proposals[0], other] }}>
    <ProposalEngagement recordId={record} onToggleComments={openComments} />
    <ProposalEngagement recordId={other.recordId} />
  </ProposalEconomyProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" }));
  const otherLike = screen.getByRole("button", { name: "Like · 2 · 1 Zcred" });
  expect(otherLike).toBeDisabled();
  expect(otherLike).toHaveAttribute("aria-busy", "false");
  fireEvent.click(otherLike);
  fireEvent.click(screen.getByRole("button", { name: /3 comments/ }));
  expect(openComments).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
  await act(async () => finish(response({ proposal: next, participation: { ...board.participation!, availableCredits: 24 } })));
  expect(screen.getByRole("button", { name: "Unlike · 1" })).toBeEnabled();
  expect(otherLike).toBeEnabled();
});
it("refreshes a changed price and requires another deliberate action with the new version", async () => {
  const next = { ...board, participation: { ...board.participation!, reactionCost: 3, version: 3 } };
  const fetcher = vi.fn().mockResolvedValueOnce(response({ error: "PARTICIPATION_POLICY_CHANGED" }, 409)).mockResolvedValue(response({ board: next }));
  vi.stubGlobal("fetch", fetcher); renderEconomy();
  fireEvent.click(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Like · 0 · 3 Zcred" })).toBeEnabled());
  expect(fetcher.mock.calls.filter(([, options]) => options?.method === "POST")).toHaveLength(1);
  expect(screen.getByRole("alert")).toHaveTextContent("price changed");
});
it("refreshes generic credit events and prevents spending while the balance is unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline"))); renderEconomy();
  await act(async () => { window.dispatchEvent(new CustomEvent("dao:credits-updated")); });
  expect(screen.getByRole("alert")).toHaveTextContent("Could not refresh participation");
  expect(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" })).toBeDisabled();
});
it("uses fresh server participation when a credit refresh is still in flight", async () => {
  let finish!: (value: ReturnType<typeof response>) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
  const view = renderEconomy();
  await act(async () => { window.dispatchEvent(new CustomEvent("dao:credits-updated")); });
  expect(screen.getByRole("button", { name: "Like · 0 · 1 Zcred" })).toBeDisabled();
  const fresh = { ...board, participation: { ...board.participation!, reactionCost: 2, version: 3 } };
  view.rerender(<ProposalEconomyProvider communityId={community.id} initial={fresh}><ProposalEconomyNotice /><ProposalEngagement recordId={record} /></ProposalEconomyProvider>);
  expect(screen.getByRole("button", { name: "Like · 0 · 2 Zcred" })).toBeEnabled();
  await act(async () => { finish(response({ board })); });
  expect(screen.getByRole("button", { name: "Like · 0 · 2 Zcred" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "Like · 0 · 1 Zcred" })).not.toBeInTheDocument();
});
it("shows the five published records with local participation and separates the DAO module", () => {
  const all = { ...board, proposals: ZCG_PROPOSAL_EXAMPLES.map(example => ({ ...board.proposals[0], recordId: example.id, title: example.title })) };
  render(<ProposalWorkspace community={community} communities={[community]} viewer={{ nick: "Reader", role: "VISITOR" }} board={all} />);
  const navigation = screen.getByRole("navigation", { name: "Community navigation" });
  expect(within(navigation).getByRole("link", { name: "Proposals" })).toHaveAttribute("aria-current", "page");
  expect(within(navigation).getByRole("link", { name: "DAO" })).toHaveAttribute("href", "/communities/public-a/dao");
  expect(screen.queryByRole("navigation", { name: "DAO navigation" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Treasury" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Approved" }));
  expect(screen.getAllByRole("button", { name: "Like · 0 · 1 Zcred" })).toHaveLength(4);
  expect(screen.getByRole("button", { name: ZCG_PROPOSAL_EXAMPLES[0].title })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
  expect(screen.getAllByRole("button", { name: "Like · 0 · 1 Zcred" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: ZCG_PROPOSAL_EXAMPLES.find(example => example.outcome === "rejected")!.title })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("25 Zcred")).not.toBeInTheDocument();
  expect(screen.queryByText("Voice")).not.toBeInTheDocument();
});
