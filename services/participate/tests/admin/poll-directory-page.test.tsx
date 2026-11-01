import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { readSessionMock, pollFindManyMock, readManagedCommunitiesMock } = vi.hoisted(() => ({
  readSessionMock: vi.fn(),
  pollFindManyMock: vi.fn(),
  readManagedCommunitiesMock: vi.fn()
}));

vi.mock("@/lib/services/communities", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/services/communities")>(),
  readManagedCommunities: readManagedCommunitiesMock
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((target: string) => {
    throw new Error(`redirect:${target}`);
  }),
  notFound: () => { throw new Error("not-found"); }
}));

vi.mock("@/lib/auth/session", () => ({
  readSession: readSessionMock
}));

vi.mock("@/lib/db", () => ({
  db: {
    poll: {
      findMany: pollFindManyMock
    }
  }
}));

import AdminPollDirectoryPage from "@/app/admin/polls/page";

beforeEach(() => {
  readSessionMock.mockReset();
  pollFindManyMock.mockReset();
  readManagedCommunitiesMock.mockResolvedValue([{ id: "community_a", name: "Community A", slug: "community-a" }]);
});

describe("AdminPollDirectoryPage", () => {
  it("shows aggregate turnout without individual completion wording", async () => {
    readSessionMock.mockResolvedValue({
      subjectType: "user",
      userId: "admin_1",
      nick: "admin",
      role: "ADMIN"
    });
    pollFindManyMock.mockResolvedValue([
      {
        id: "poll_1",
        question: "Which option should we fund?",
        status: "OPEN",
        opensAt: new Date("2026-05-01T10:00:00.000Z"),
        closesAt: new Date("2026-05-03T10:00:00.000Z"),
        tally: {
          totalConfirmed: 1
        },
        voterAccesses: [
          {
            id: "access_1",
            assignments: [{ ticket: { status: "VOTED" } }]
          },
          {
            id: "access_2",
            assignments: [{ ticket: { status: "ISSUED" } }]
          }
        ]
      }
    ]);

    render(await AdminPollDirectoryPage({}));

    expect(screen.getByText("Votes received")).toBeInTheDocument();
    expect(screen.getByText("1/2 received (50%)")).toBeInTheDocument();
    expect(screen.queryByText("Completed voters")).not.toBeInTheDocument();
    expect(screen.queryByText(/how many voters completed/i)).not.toBeInTheDocument();
    expect(pollFindManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        communityId: "community_a",
        community: { is: { kind: "DAO", memberships: { some: {
          userId: "admin_1", role: { in: ["OWNER", "MANAGER"] }, status: "ACTIVE", user: { status: "ACTIVE" }
        } } } }
      })
    }));
  });
});
