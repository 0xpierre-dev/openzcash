import { beforeEach, describe, expect, it, vi } from "vitest";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => { throw new Error("NEXT_REDIRECT"); })
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));

import HomePage from "@/app/page";

beforeEach(() => {
  redirectMock.mockClear();
});

describe("HomePage", () => {
  it("opens the community proposals entry without a login wall", () => {
    expect(() => HomePage()).toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledExactlyOnceWith("/communities");
  });
});
