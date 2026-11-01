// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommitteeWorkspacePanel } from "./committee-workspace";
import { DemoBanner } from "./committee-demo";
import {
  committeePermissions,
  type CommitteeWorkspace,
} from "@/lib/participate/workspace/domain/committee";

vi.mock("./proposal-inline-details", () => ({
  ProposalInlineDetails: () => null,
}));
const api = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/participate/workspace/auth/passkey-client", () => ({
  passkeyFetch: api.fetch,
}));
vi.mock("./signed-decision", () => ({
  SignedDecision: ({ visible }: { visible: boolean }) =>
    visible ? <p>Signed vote form</p> : null,
}));
vi.mock("./review-finish", () => ({
  ReviewFinish: ({ visible }: { visible: boolean }) =>
    visible ? <p>Review closeout</p> : null,
}));
vi.mock("./workspace-account", () => ({ AccountAvatar: () => <span /> }));
vi.mock("./workspace-auth", () => ({
  WorkspaceSignInButton: () => <button>Sign in</button>,
}));
vi.mock("./committee-labels", () => ({
  CommitteeLabels: () => null,
  CommitteeLabelEditor: () => null,
}));

const proposal = {
  recordId: "zcg-github-462",
  hostId: "host",
  title: "Real proposal title",
  revision: 1,
  kind: "ZCG_GITHUB_APPLICATION",
  state: "OPEN",
  roundId: "round-1",
  closesAt: null,
  signed: 1,
  eligible: 5,
  myChoice: "APPROVE",
  myPending: false,
  labels: [],
  labelsVersion: 0,
};
const workspace: CommitteeWorkspace = {
  access: "MEMBER",
  name: "ZCG",
  role: "MANAGER",
  demo: false,
  canMutate: true,
  emailReady: true,
  permissions: committeePermissions("MANAGER"),
  rules: { quorum: 5, approvalPercent: 60, durationHours: null, version: 0 },
  members: [],
  invitations: [],
  queue: [proposal],
  history: [],
  historyBefore: null,
};
const decided = {
  ...workspace,
  queue: [{ ...proposal, state: "APPROVED", signed: 5 }],
};

beforeEach(() => api.fetch.mockReset());
afterEach(cleanup);

it("labels the whole demo as test data", () => {
  render(<DemoBanner />);
  expect(
    screen.getByRole("note", { name: "Demo environment" }).textContent,
  ).toMatch(
    /Demo · test data.*Nothing is anchored, posted to GitHub or written to Google Sheets/,
  );
});

it("shows no demo controls outside the demo deployment", () => {
  render(
    <CommitteeWorkspacePanel
      initial={workspace}
      initialRecordId={proposal.recordId}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Vote" }));
  expect(screen.queryByRole("button", { name: /Fill the other/ })).toBeNull();
  expect(screen.queryByRole("button", { name: "Reset demo" })).toBeNull();
});

it("fills the tester's open round with the chosen test outcome and moves to Finish", async () => {
  api.fetch.mockImplementation(async (url: string, body?: unknown) => {
    if (url === "/api/participate/demo")
      return {
        signed: [
          { seat: "Test seat 2", choice: "REJECT" },
          { seat: "Test seat 3", choice: "REJECT" },
          { seat: "Test seat 4", choice: "REJECT" },
          { seat: "Test seat 5", choice: "REJECT" },
        ],
        body,
      };
    return decided;
  });
  render(
    <CommitteeWorkspacePanel
      initial={workspace}
      initialRecordId={proposal.recordId}
      demoMode
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Vote" }));
  expect(screen.getByText(/4 test seats are waiting/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Test seats vote"), {
    target: { value: "REJECT" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Fill the other 4 seats" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toContain(
      "4 test ballots signed: Test seat 2 reject",
    ),
  );
  expect(api.fetch).toHaveBeenCalledWith("/api/participate/demo", {
    action: "fill",
    recordId: proposal.recordId,
    outcome: "REJECT",
  });
  expect(screen.getByText("Review closeout")).toBeTruthy();
});

it("explains a round opened by another tester instead of offering to fill it", () => {
  render(
    <CommitteeWorkspacePanel
      initial={{
        ...workspace,
        queue: [{ ...proposal, myChoice: null, myPending: false }],
      }}
      initialRecordId={proposal.recordId}
      demoMode
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Vote" }));
  expect(screen.getByText(/Another tester opened this review/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Fill the other/ })).toBeNull();
});

it("resets only after confirmation", async () => {
  api.fetch.mockImplementation(async (url: string) =>
    url === "/api/participate/demo" ? { rounds: 1, proposals: 1 } : workspace,
  );
  render(<CommitteeWorkspacePanel initial={decided} demoMode />);
  fireEvent.click(screen.getByRole("button", { name: "Reset demo" }));
  expect(api.fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "Demo reset. 1 test review cleared.",
    ),
  );
  expect(api.fetch).toHaveBeenCalledWith("/api/participate/demo", {
    action: "reset",
  });
});
