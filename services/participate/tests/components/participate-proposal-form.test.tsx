import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ParticipateProposalForm } from "@/components/participate-proposal-form";
import { EMPTY_SUBMISSION, type SubmissionDraft } from "@/lib/domain/proposal-submission";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/workspace-auth", () => ({ WorkspaceSignInButton: ({ label }: { label: string }) => <button>{label}</button> }));
const draft: SubmissionDraft = { id: "078b0fc7-ae08-4fbf-ac40-6224f23613b4", version: 1, contentHash: "a".repeat(64), state: "DRAFT", recordId: null, updatedAt: "2026-10-10T00:00:00Z",
  payload: { ...EMPTY_SUBMISSION, title: "A complete native proposal", applicant: "Public team", requestedAmountUsd: "1234.56", forumUrl: "https://forum.zcashcommunity.com/t/pilot-proposal/12345", body: "## Milestones\n\nWe will publish a reusable guide, deliver two sessions, and report measurable outcomes with a clear budget." } };
const props = { drafts: [], signedIn: true, sandbox: true, balance: 25, communityId: "host", creditScopeId: "committee" };
const response = (value: unknown) => ({ ok: true, json: async () => value });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); router.refresh.mockClear(); });

it("offers ZCG intake without DAO voting dates and preserves guest text after sign-in", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const { rerender } = render(<ParticipateProposalForm {...props} signedIn={false} />);
  expect(screen.getByRole("button", { name: "Use ZCG template" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Voting opens")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Funding source")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Proposal title"), { target: { value: "My draft before signing in" } });
  rerender(<ParticipateProposalForm {...props} signedIn />);
  expect(screen.getByLabelText("Proposal title")).toHaveValue("My draft before signing in");
  expect(fetcher).not.toHaveBeenCalled();
});

it("requires confirmation before replacing typed Markdown and renders preview", () => {
  render(<ParticipateProposalForm {...props} initial={draft} />);
  fireEvent.click(screen.getByRole("button", { name: "Use ZCG template" }));
  expect(screen.getByLabelText("Proposal", { exact: true })).toHaveValue(draft.payload.body);
  fireEvent.click(screen.getByRole("button", { name: "Keep my text" }));
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(screen.getByRole("heading", { name: "Milestones" })).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
});

it.each(["demo", "production"] as const)("saves privately before %s publication, binding consent, price and revision", async mode => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ draft })).mockResolvedValueOnce(response({ credits: { accounts: [{ communityId: "committee", balance: 25 }] } }))
    .mockResolvedValueOnce(response({ draft: { ...draft, state: mode === "production" ? "PUBLISHED" : "PUBLISHED_DEMO", recordId: `${mode === "production" ? "proposal" : "pilot"}-${draft.id}` } }));
  vi.stubGlobal("fetch", fetcher);
  render(<ParticipateProposalForm {...props} initial={draft} publicationMode={mode} />);
  fireEvent.click(screen.getByRole("button", { name: "Review & submit →" }));
  const publish = await screen.findByRole("button", { name: "Publish · 20 demo Zcred" });
  expect(publish).toBeDisabled();
  expect(screen.getByText("US$5.00 reference value · Free in this pilot")).toBeInTheDocument();
  expect(screen.getByText(mode === "production" ? "Publish to the community" : "Publish a test proposal")).toBeVisible();
  expect(screen.getByRole("note")).toHaveTextContent("Official ZCG applications still go through GitHub");
  expect(screen.getByRole("note")).toHaveTextContent("Committee review is not enabled here");
  expect(screen.getByText("= US$0.25")).toBeInTheDocument();
  expect(screen.getByText("5 demo Zcred")).toBeInTheDocument();
  expect(fetcher.mock.calls[0][1].method).toBe("PUT");
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(publish);
  await screen.findByRole("heading", { name: "Proposal published" });
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({ id: draft.id, expectedVersion: 1, contentHash: draft.contentHash, priceVersion: 1, consent: true });
  expect(screen.getByRole("link", { name: "View proposal →" })).toHaveAttribute("href", `/participate?record=${mode === "production" ? "proposal" : "pilot"}-${draft.id}`);
  expect(screen.getByRole("link", { name: "Download record" })).toHaveAttribute("href", `/api/communities/host/archives/${mode === "production" ? "proposal" : "pilot"}-${draft.id}/revisions/1`);
});

it("retries an uncertain publication with the same key and never sends on preview alone", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ draft })).mockResolvedValueOnce(response({ credits: { accounts: [{ communityId: "committee", balance: 25 }] } }))
    .mockRejectedValueOnce(new Error("Connection interrupted"))
    .mockResolvedValueOnce(response({ draft: { ...draft, state: "PUBLISHED_DEMO", recordId: `pilot-${draft.id}` } }));
  vi.stubGlobal("fetch", fetcher); render(<ParticipateProposalForm {...props} initial={draft} />);
  fireEvent.click(screen.getByRole("button", { name: "Preview" }));
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Review & submit →" }));
  const publish = await screen.findByRole("button", { name: "Publish · 20 demo Zcred" });
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(publish);
  await screen.findByRole("alert");
  await waitFor(() => expect(publish).toBeEnabled());
  fireEvent.click(publish);
  await screen.findByRole("heading", { name: "Proposal published" });
  expect(JSON.parse(fetcher.mock.calls[2][1].body).requestKey).toBe(JSON.parse(fetcher.mock.calls[3][1].body).requestKey);
});

it("blocks demo publication with insufficient credits or outside an enabled demo", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response({ draft })).mockResolvedValueOnce(response({ credits: { accounts: [{ communityId: "committee", balance: 5 }] } })));
  render(<ParticipateProposalForm {...props} initial={draft} sandbox={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Review & submit →" }));
  const publish = await screen.findByRole("button", { name: "Publish · 20 demo Zcred" });
  fireEvent.click(screen.getByRole("checkbox"));
  expect(publish).toBeDisabled();
  expect(screen.getByText(/Paid publication is being prepared/)).toBeInTheDocument();
});

it.each(["", "https://example.org/t/a-proposal/12345"])("keeps the required forum field visible and blocks review for %j without saving or charging", async forumUrl => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<ParticipateProposalForm {...props} initial={{ ...draft, payload: { ...draft.payload, forumUrl } }} />);
  const forum = screen.getByRole("textbox", { name: /Forum discussion/ });
  expect(forum).toBeRequired();
  expect(forum).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Review & submit →" }));
  await screen.findByRole("alert");
  expect(forum).toHaveAttribute("aria-invalid", "true");
  expect(forum).toHaveFocus();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(forum, { target: { value: draft.payload.forumUrl } });
  expect(forum).toHaveAttribute("aria-invalid", "false");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("still saves a private draft without a forum link", async () => {
  const incomplete = { ...draft, payload: { ...draft.payload, forumUrl: "" } };
  const fetcher = vi.fn().mockResolvedValue(response({ draft: incomplete })); vi.stubGlobal("fetch", fetcher);
  render(<ParticipateProposalForm {...props} initial={incomplete} />);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByRole("status");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1].method).toBe("PUT");
  expect(JSON.parse(fetcher.mock.calls[0][1].body).payload.forumUrl).toBe("");
});

it("claims the one-time free allowance during review without publishing or charging", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(response({ draft }))
    .mockResolvedValueOnce(response({ credits: { accounts: [{ communityId: "committee", balance: 0, canClaimPreview: true }] } }))
    .mockResolvedValueOnce(response({ credits: { accounts: [{ communityId: "committee", balance: 25, canClaimPreview: false }] } }));
  vi.stubGlobal("fetch", fetcher);
  render(<ParticipateProposalForm {...props} initial={draft} balance={0} />);
  fireEvent.click(screen.getByRole("button", { name: "Review & submit →" }));
  fireEvent.click(await screen.findByRole("button", { name: "Get 25 free Zcred" }));
  await screen.findByText("25 demo Zcred");
  expect(fetcher.mock.calls[2][0]).toBe("/api/account/credits/preview");
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({ communityId: "committee" });
  expect(screen.queryByRole("button", { name: "Get 25 free Zcred" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publish · 20 demo Zcred" })).toBeDisabled();
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(router.refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Review your proposal" })).toBeInTheDocument();
});
