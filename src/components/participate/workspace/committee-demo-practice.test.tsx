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
import { DemoPractice } from "./committee-demo-practice";
import {
  committeePermissions,
  type CommitteeWorkspace,
} from "@/lib/participate/workspace/domain/committee";

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  voted: { current: null as null | (() => void) },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/participate/workspace/auth/passkey-client", () => ({
  passkeyFetch: api.fetch,
}));
vi.mock("@/components/participate/workspace/workspace-auth", () => ({
  WorkspaceSignInForm: ({ next }: { next: string }) => (
    <p>Sign-in form → {next}</p>
  ),
}));
vi.mock("@/components/participate/workspace/passkey-confirmation-form", () => ({
  PasskeyConfirmationForm: () => <p>Passkey form</p>,
}));
vi.mock("@/components/participate/workspace/signed-decision", () => ({
  SignedDecision: ({ onChanged }: { onChanged: () => void }) => {
    api.voted.current = onChanged;
    return <p>Signed vote form</p>;
  },
}));
vi.mock("./review-finish", () => ({
  ReviewFinish: () => <p>Review closeout</p>,
}));

const member = (ready: boolean): CommitteeWorkspace => ({
  access: "MEMBER",
  name: "ZCG",
  role: "MANAGER",
  demo: false,
  canMutate: true,
  emailReady: true,
  permissions: committeePermissions("MANAGER"),
  rules: { quorum: 5, approvalPercent: 60, durationHours: null, version: 0 },
  invitations: [],
  queue: [],
  history: [],
  historyBefore: null,
  members: [
    {
      id: "m",
      name: "Demo tester 1A2B",
      avatar: null,
      email: "me@example.org",
      role: "MANAGER",
      status: "ACTIVE",
      version: 1,
      ready,
      isMe: true,
      emailVerified: true,
      keyCount: ready ? 1 : 0,
    },
  ],
});
const round = {
  hostId: "host",
  recordId: "zcg-github-500",
  title: "Real proposal",
  revision: 1,
  roundId: "round-1",
  signed: 0,
  eligible: 5,
  complete: false,
};
const published = {
  round: null,
  canManage: true,
  canCreate: false,
  roster: [],
  myChoice: "APPROVE",
  tally: { outcome: "APPROVED", approve: 3, reject: 2, abstain: 0 },
};

beforeEach(() => {
  api.fetch.mockReset();
  api.voted.current = null;
});
afterEach(cleanup);

it("starts with an inline email sign-in that returns to the practice page", () => {
  render(<DemoPractice committee={null} signedIn={false} />);
  expect(
    screen.getByText("Sign-in form → /zcg/participate?view=practice"),
  ).toBeTruthy();
  expect(
    screen.getByText("Sign in").closest("li")?.getAttribute("aria-current"),
  ).toBe("step");
});

it("asks for the passkey right after sign-in, on the same page", () => {
  render(<DemoPractice committee={member(false)} signedIn />);
  fireEvent.click(screen.getByRole("button", { name: "Create passkey" }));
  expect(screen.getByText("Passkey form")).toBeTruthy();
  expect(api.fetch).not.toHaveBeenCalled();
});

it("opens a practice round, signs the four test seats one by one after the vote and shows the result", async () => {
  let seat = 0;
  api.fetch.mockImplementation(
    async (url: string, body?: { action?: string }) => {
      if (url === "/api/participate/demo" && body?.action === "practice")
        return round;
      if (url === "/api/participate/demo" && body?.action === "fill") {
        seat++;
        return {
          signed: [
            {
              seat: `Test seat ${seat + 1}`,
              choice: seat < 3 ? "APPROVE" : "REJECT",
            },
          ],
          remaining: 4 - seat,
        };
      }
      return published;
    },
  );
  render(<DemoPractice committee={member(true)} signedIn />);
  await screen.findByText("Signed vote form");
  expect(screen.getByRole("heading", { name: "Real proposal" })).toBeTruthy();
  api.voted.current?.();
  await screen.findByRole("heading", { name: "Approved · 3 of 5 approve" });
  expect(
    api.fetch.mock.calls.filter(([, body]) => body?.action === "fill"),
  ).toHaveLength(4);
  expect(api.fetch).toHaveBeenCalledWith("/api/participate/demo", {
    action: "fill",
    recordId: "zcg-github-500",
    outcome: "SPLIT",
    limit: 1,
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Finish: Sheets row A–G" }),
  );
  expect(screen.getByText("Review closeout")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try another proposal" }));
  await waitFor(() =>
    expect(api.fetch).toHaveBeenCalledWith("/api/participate/demo", {
      action: "practice",
      fresh: true,
    }),
  );
});
