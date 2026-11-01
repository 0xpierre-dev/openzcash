import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProposalWorkspace } from "@/components/proposal-workspace";
import { ZcgProposalExamples } from "@/components/zcg-proposal-examples";
import { ZCG_REVIEW_PROPOSALS } from "@/lib/data/zcg-review-proposals";
import * as sourceMetadata from "@/lib/data/zcg-source-metadata";
import type { ProposalParticipationBoard } from "@/lib/domain/proposal-participation";
import { sourceCaptureFixture } from "@/tests/helpers/source-capture";

vi.mock("@/components/community-workspace", () => ({ WorkspaceFrame: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock("@/components/proposal-economy", () => ({ ProposalEconomyProvider: ({ children }: { children: ReactNode }) => <>{children}</>, ProposalEconomyNotice: () => null, ProposalEngagement: () => <button>Comments</button> }));
vi.mock("@/components/proposal-inline-details", () => ({ ProposalInlineDetails: () => null }));
vi.mock("@/components/submission-lifecycle", () => ({ AbandonmentNotice: () => null, SubmissionLifecycleAction: () => null }));
vi.mock("@/components/proposal-zec-estimate", () => ({ useProposalZecPrice: () => ({ status: "unavailable", price: null }), ProposalZecEstimate: () => <span data-testid="zec-estimate">ZEC estimate</span> }));

const community = { id: "source-community", name: "ZCG", slug: "zcg" };
function board(outcome: "approved" | "rejected" | "abandoned" | "closed"): ProposalParticipationBoard {
  const capture = sourceCaptureFixture();
  capture.proposal.outcome = outcome;
  capture.source.labels = capture.proposal.outcome === "approved" ? capture.source.labels : [];
  return { canParticipate: false, participation: null, proposals: [{ recordId: capture.proposal.id, title: capture.proposal.title,
    sourceCapture: capture, commentCount: 0, likes: 0, likedByMe: false, chargedBefore: false }] };
}

it.each([["approved", "Approved"], ["rejected", "Rejected"], ["abandoned", "Abandoned"]] as const)("moves captured %s revisions into the matching filter without fabricating committee votes", (outcome, label) => {
  render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={board(outcome)} />);
  expect(screen.queryByRole("button", { name: "Closed" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "A preserved source proposal" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(screen.getByRole("heading", { name: "A preserved source proposal" })).toBeVisible();
  expect(screen.queryByRole("group", { name: "Committee votes and feedback" })).not.toBeInTheDocument();
  expect(screen.queryByText(/turnout|Awaiting committee decision/)).not.toBeInTheDocument();
});

it("opens a source comment destination in its captured outcome filter", () => {
  render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={board("approved")} initialRecordId="zcg-github-99901" initialCommentId="comment-1" />);
  expect(screen.getByRole("button", { name: "Approved" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("heading", { name: "A preserved source proposal" })).toBeVisible();
});

it("shows the recovered applicant category beside official labels without changing the old capture", () => {
  const current = board("approved");
  const row = current.proposals[0];
  row.sourceCapture!.proposal.title = row.title = "Grant Application - Zcash Private Receive Bridge";
  row.sourceCapture!.proposal.tags = [];
  row.sourceCapture!.source.category = null;
  row.sourceCategory = "Infrastructure";
  render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={current} initialRecordId={row.recordId} />);
  expect(screen.getByRole("list", { name: "Proposal sectors" })).toHaveTextContent("Infrastructure");
  expect(screen.getByText("Infrastructure")).toHaveAttribute("title", "Applicant category on GitHub · Infrastructure");
  expect(screen.getByRole("list", { name: "GitHub labels" })).toHaveTextContent("✅ Grant Approved");
  expect(row.sourceCapture!.source.category).toBeNull();
  expect(row.sourceCapture!.proposal.tags).toEqual([]);
});

it.each([38000, 38000.25, 0])("shows the requested amount %s only for active review without a ZEC estimate", amount => {
  const current = board("approved");
  const row = current.proposals[0];
  row.sourceCapture!.proposal.outcome = "under_review";
  row.sourceCapture!.proposal.requestedUsd = null;
  row.sourceRequestedUsd = amount;
  render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={current} />);
  const displayed = amount.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });
  expect(screen.getByRole("group", { name: `Requested budget: ${displayed} USD` })).toHaveTextContent("USD requested");
  expect(screen.queryByTestId("zec-estimate")).not.toBeInTheDocument();
  expect(row.sourceCapture!.proposal.requestedUsd).toBeNull();
});

it.each(["approved", "rejected", "abandoned", "closed"] as const)("never presents a request as an award on a %s proposal", outcome => {
  const current = board(outcome);
  const row = current.proposals[0];
  row.sourceRequestedUsd = 99999;
  row.sourceCapture!.proposal.requestedUsd = 99999;
  render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={current} initialRecordId={row.recordId} />);
  expect(screen.queryByRole("group", { name: /Requested budget/ })).not.toBeInTheDocument();
  expect(screen.queryByText("$99,999")).not.toBeInTheDocument();
});

it("places a source closure only in its conditional Closed filter without calling it a rejection", () => {
  render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={board("closed")} />);
  expect(screen.queryByRole("heading", { name: "A preserved source proposal" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Under review" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Closed" }));
  expect(screen.getByRole("heading", { name: "A preserved source proposal" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Closed" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText("Awaiting committee decision")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
  expect(screen.queryByRole("heading", { name: "A preserved source proposal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
});

it("opens a closed record deep link in Closed and falls back when no closed records remain", () => {
  const props = { community, communities: [community], viewer: null, initialRecordId: "zcg-github-99901" };
  const { rerender } = render(<ProposalWorkspace {...props} board={board("closed")} />);
  expect(screen.getByRole("button", { name: "Closed" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("heading", { name: "A preserved source proposal" })).toBeVisible();
  rerender(<ProposalWorkspace {...props} board={board("approved")} />);
  expect(screen.queryByRole("button", { name: "Closed" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Under review" })).toHaveAttribute("aria-pressed", "true");
});

it("also separates closed catalog sources from active review before a V2 capture exists", () => {
  const proposal = ZCG_REVIEW_PROPOSALS[0];
  const source = sourceMetadata.zcgSourceMetadata(proposal.id)!;
  const metadata = vi.spyOn(sourceMetadata, "zcgSourceMetadata").mockReturnValue({ ...source, state: "closed" });
  try {
    render(<ZcgProposalExamples proposals={[proposal]} />);
    expect(screen.queryByRole("link", { name: proposal.title })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Closed" }));
    expect(screen.getByRole("link", { name: proposal.title })).toBeVisible();
    expect(screen.queryByText("Awaiting committee decision")).not.toBeInTheDocument();
  } finally { metadata.mockRestore(); }
});

it("retains a documented historical budget only while the latest captured source still establishes approval", () => {
  const approved = board("approved");
  const proposal = approved.proposals[0];
  proposal.sourceRequestedUsd = 99999;
  proposal.recordId = proposal.sourceCapture!.proposal.id = proposal.sourceCapture!.source.recordId = "zcg-graphsense-2026-09-28";
  const { rerender } = render(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={approved} initialRecordId={proposal.recordId} />);
  expect(screen.getByRole("group", { name: "Previously recorded approved budget: $8,000.00 USD" })).toBeVisible();
  expect(screen.queryByText("80%")).not.toBeInTheDocument();
  const abandoned = { ...approved, proposals: [{ ...proposal, sourceCapture: { ...proposal.sourceCapture!, proposal: { ...proposal.sourceCapture!.proposal, outcome: "abandoned" as const } } }] };
  rerender(<ProposalWorkspace community={community} communities={[community]} viewer={null} board={abandoned} initialRecordId={proposal.recordId} />);
  fireEvent.click(screen.getByRole("button", { name: "Abandoned" }));
  expect(screen.getByRole("heading", { name: "A preserved source proposal" })).toBeVisible();
  expect(screen.queryByRole("group", { name: /Previously recorded approved budget/ })).not.toBeInTheDocument();
});
