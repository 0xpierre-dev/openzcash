import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProposalInlineDetails } from "@/components/proposal-inline-details";
import type { DiscussionPolicy } from "@/components/proposal-discussion";
import type { ProposalRecord } from "@/lib/domain/proposal-record";
import { sourceCaptureFixture } from "@/tests/helpers/source-capture";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/workspace-auth", () => ({ WorkspaceSignInButton: ({ label }: { label: string }) => <button>{label}</button> }));
const policy: DiscussionPolicy = { visibility: "PUBLIC", immutable: true, maxLength: 4000, readOnly: false,
  participation: { mode: "CREDITS", commentCost: 1, reactionCost: 1, version: 1, availableCredits: 23, sponsored: false, sandbox: true } };
const discussion = { comments: [], capabilities: { canPost: true, canReact: true, canModerate: false }, policy };
const record: ProposalRecord = { recordId: "record-a", title: "Test proposal", revision: 1, originalDecisionDate: "2026-09-28", capturedAt: "2026-10-09T00:00:00Z", markdown: "# Test proposal\n\nA preserved summary.", manifestHash: "a".repeat(64), fileCount: 2, revisions: [{ revision: 1, publishedAt: "2026-10-09T00:00:00Z" }], network: null, proof: { label: "Not anchored", detail: "No transaction has been submitted.", verified: false, evidence: null, hasReceipt: false } };
const response = (body: unknown) => ({ ok: true, json: async () => body });
const props = { communityId: "dao-a", recordId: "record-a", onClose: vi.fn(), sessionKey: "reader" };
afterEach(() => vi.unstubAllGlobals());

it("opens a usable draft immediately while confirmed comments and permissions load", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
  render(<ProposalInlineDetails {...props} active="discussion" preview={{ commentCount: 2, canParticipate: true, participation: policy.participation }} />);
  expect(screen.getByRole("heading", { name: "Discussion 2" })).toBeVisible();
  const composer = screen.getByRole("textbox", { name: "Add to the discussion" });
  fireEvent.change(composer, { target: { value: "A draft while the comments load." } });
  expect(screen.getByRole("button", { name: "Publish · 1 Zcred" })).toBeDisabled();
  await act(async () => finish(response(discussion)));
  await waitFor(() => expect(screen.getByRole("button", { name: "Publish · 1 Zcred" })).toBeEnabled());
  expect(composer).toHaveValue("A draft while the comments load.");
});

it("loads only on demand and preserves a draft across folding and reading", async () => {
  const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(response(url.endsWith("comments") ? discussion : { record })));
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<ProposalInlineDetails {...props} active={null} />);
  expect(fetcher).not.toHaveBeenCalled();
  rerender(<ProposalInlineDetails {...props} active="discussion" />);
  const composer = await screen.findByRole("textbox", { name: "Add to the discussion" });
  fireEvent.change(composer, { target: { value: "Keep this unpublished draft." } });
  expect(screen.getByRole("button", { name: "Publish · 1 Zcred" })).toBeEnabled();
  expect(screen.queryByText("23 Zcred available")).not.toBeInTheDocument();
  expect(screen.queryByText("Demo Zcred")).not.toBeInTheDocument();
  expect(screen.queryByText(/Public discussion · Separate/)).not.toBeInTheDocument();
  expect(screen.queryByText(/There’s room for your perspective/)).not.toBeInTheDocument();
  expect(screen.getByText("Public · Cannot be edited after publishing.")).toBeVisible();
  expect(screen.queryByText("Activity & receipts")).not.toBeInTheDocument();
  rerender(<ProposalInlineDetails {...props} active={null} />);
  expect(composer).not.toBeVisible();
  rerender(<ProposalInlineDetails {...props} active="record" />);
  await screen.findByText("A preserved summary.");
  expect(composer).not.toBeVisible();
  rerender(<ProposalInlineDetails {...props} active="discussion" />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
  expect(screen.getByRole("textbox")).toHaveValue("Keep this unpublished draft.");
  expect(fetcher.mock.calls.every(([, options]) => !options.method)).toBe(true);
});

it("retries a failed load inside the panel", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(response(discussion));
  vi.stubGlobal("fetch", fetcher); render(<ProposalInlineDetails {...props} active="discussion" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load comments");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByRole("textbox");
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(props.onClose).toHaveBeenCalled();
});

it("retains a draft if the reopen refresh fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(discussion)).mockRejectedValue(new Error("offline")));
  const { rerender } = render(<ProposalInlineDetails {...props} active="discussion" />);
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Draft before connection loss" } });
  rerender(<ProposalInlineDetails {...props} active={null} />);
  rerender(<ProposalInlineDetails {...props} active="discussion" />);
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox")).toHaveValue("Draft before connection loss");
});

it("keeps verification optional and binds downloads to the viewed revision", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ record }));
  vi.stubGlobal("fetch", fetcher); render(<ProposalInlineDetails {...props} active="record" />);
  await screen.findByText("A preserved summary.");
  expect(screen.queryByRole("link", { name: "Download revision ↓" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Files & proof/ }));
  expect(screen.getByRole("link", { name: "Download revision ↓" })).toHaveAttribute("href", "/api/communities/dao-a/archives/record-a/revisions/1");
  expect(screen.queryByRole("link", { name: "Chain receipt ↓" })).not.toBeInTheDocument();
  expect(screen.getByText("No transaction has been submitted.")).toBeVisible();
});

it("loads fresh account capabilities after inline sign-in", async () => {
  const guest = { ...discussion, capabilities: { canPost: false, canReact: false, canModerate: false }, policy: { ...policy, participation: { ...policy.participation, availableCredits: null } } };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response(guest)).mockResolvedValue(response(discussion)));
  const { rerender } = render(<ProposalInlineDetails {...props} sessionKey="guest" active="discussion" />);
  await screen.findByRole("button", { name: "Sign in to participate" });
  rerender(<ProposalInlineDetails {...props} active="discussion" />);
  expect(await screen.findByRole("textbox")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Sign in to participate" })).not.toBeInTheDocument();
});

it("ignores a late response after the panel was closed", async () => {
  let finish!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
  const { rerender } = render(<ProposalInlineDetails {...props} active="discussion" />);
  rerender(<ProposalInlineDetails {...props} active={null} />);
  await act(async () => { finish(response(discussion)); });
  expect(screen.queryByRole("textbox", { hidden: true })).not.toBeInTheDocument();
});

it("focuses the notified reply instead of the composer, including a fresh reply in an already open panel", async () => {
  const comment = { id: "root", parentId: null, authorLabel: "Author", createdAt: "2026-10-10T12:00:00Z", body: "Original comment", hidden: false, moderation: null };
  const reply = { ...comment, id: "reply", parentId: "root", authorLabel: "Reader", body: "New reply" };
  const fetcher = vi.fn().mockResolvedValueOnce(response({ ...discussion, comments: [comment] })).mockResolvedValue(response({ ...discussion, comments: [comment, reply] }));
  vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<ProposalInlineDetails {...props} active="discussion" />);
  fireEvent.change(await screen.findByRole("textbox"), { target: { value: "Keep my pending comment" } });
  rerender(<ProposalInlineDetails {...props} active="discussion" focusComment={{ id: "reply", request: 1 }} />);
  await screen.findByText("New reply");
  await waitFor(() => expect(document.getElementById("comment-reply")).toHaveFocus());
  expect(screen.getByRole("textbox")).toHaveValue("Keep my pending comment");
});

it("opens source cards with accurate attribution and keeps earlier revisions accessible", async () => {
  const sourceCapture = sourceCaptureFixture();
  const latest: ProposalRecord = { ...record, kind: "SOURCE_PROPOSAL", revision: 2, manifestHash: "b".repeat(64), sourceCapture,
    revisions: [{ revision: 2, publishedAt: sourceCapture.checkedAt }, ...record.revisions] };
  const fetcher = vi.fn((url: string) => Promise.resolve(response({ record: url.includes("?revision=1") ? { ...record, revisions: latest.revisions } : latest })));
  vi.stubGlobal("fetch", fetcher);
  render(<ProposalInlineDetails {...props} active="record" />);
  const disclosure = await screen.findByRole("button", { name: /Source decisions/ });
  expect(screen.getByText("Source rationale.")).not.toBeVisible();
  fireEvent.click(disclosure);
  expect(screen.getByText(/Repository roles identify the source/)).toBeVisible();
  expect(screen.getByText("Label added · ✅ Grant Approved")).toBeVisible();
  expect(screen.getByRole("heading", { name: "Source comments" })).toBeVisible();
  fireEvent.click(screen.getByText("@source-maintainer"));
  expect(screen.getByText("Source rationale.")).toBeVisible();
  expect(screen.getByRole("link", { name: "Download source evidence ↓" })).toHaveAttribute("href", "/api/communities/dao-a/archives/record-a/revisions/2?file=source.json");
  fireEvent.change(screen.getByRole("combobox", { name: "Record revision" }), { target: { value: "1" } });
  await waitFor(() => expect(screen.queryByRole("button", { name: /Source decisions/ })).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /Files & proof/ }));
  expect(screen.getByRole("link", { name: "Download revision ↓" })).toHaveAttribute("href", "/api/communities/dao-a/archives/record-a/revisions/1");
});

it("keeps file tools mounted and every section reachable without opening unrelated requests", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ record }));
  vi.stubGlobal("fetch", fetcher);
  render(<ProposalInlineDetails {...props} active="record" />);
  await screen.findByText("A preserved summary.");
  expect(screen.getByRole("navigation", { name: "Record sections" })).toBeVisible();
  expect(screen.queryByRole("button", { name: /Source decisions/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Files & proof/ }));
  fireEvent.click(screen.getByText("Fingerprint & evidence"));
  expect(screen.getByText(record.manifestHash)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Proposal Preserved contents/ }));
  expect(screen.getByText(record.manifestHash)).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /Files & proof/ }));
  expect(screen.getByText(record.manifestHash)).toBeVisible();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: /Files & proof/ })).toHaveAttribute("aria-pressed", "true");
});

it("returns to the record heading after a scrolled section switch without moving an already visible heading", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ record })));
  render(<ProposalInlineDetails {...props} active="record" />);
  const title = await screen.findByRole("heading", { name: "Preserved record" });
  const heading = title.closest("header")!;
  const bounds = vi.spyOn(heading, "getBoundingClientRect").mockReturnValue({ top: -500 } as DOMRect);
  const scroll = vi.fn(() => {
    // Scrolling happens after the new panel becomes visible, not against the old layout.
    expect(screen.getByRole("region", { name: "Files and verification" })).toBeVisible();
  });
  Object.defineProperty(heading, "scrollIntoView", { configurable: true, value: scroll });
  fireEvent.click(screen.getByRole("button", { name: /Files & proof/ }));
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "start", behavior: "instant" });
  bounds.mockReturnValue({ top: 120 } as DOMRect);
  fireEvent.click(screen.getByRole("button", { name: /Proposal Preserved contents/ }));
  expect(screen.getByText("A preserved summary.")).toBeVisible();
  expect(scroll).toHaveBeenCalledTimes(1);
});
