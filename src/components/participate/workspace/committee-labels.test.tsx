// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CommitteeLabelEditor } from "./committee-labels";
import { COMMITTEE_LABELS } from "@/lib/participate/workspace/domain/committee-labels";

vi.mock("@/lib/participate/workspace/auth/passkey-client", () => ({ passkeyFetch: vi.fn() }));
afterEach(cleanup);

const preVote = COMMITTEE_LABELS.filter(label => label.group === "Review");
const later = COMMITTEE_LABELS.find(label => label.group === "Compliance")!;

it("shows pre-vote tags as toggles and keeps the rest in the More tags checklist", () => {
  render(<CommitteeLabelEditor recordId="r" labels={[]} version={0} canReview canSave demo={false} onSaved={vi.fn()} onReload={vi.fn(async () => {})} />);
  for (const label of preVote) expect(screen.getByRole("button", { name: label.name, pressed: false })).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: preVote[0].name }));
  expect(screen.getByRole("button", { name: preVote[0].name, pressed: true })).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /^More tags/ }));
  expect(screen.queryByRole("checkbox", { name: preVote[0].name })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: later.name }));
  fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search tags" }), { key: "Escape" });
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.getByRole("button", { name: /^More tags/ }).textContent).toContain("1");
  fireEvent.click(screen.getByRole("button", { name: `Remove ${later.name}` }));
  expect(screen.queryByRole("button", { name: `Remove ${later.name}` })).toBeNull();
  expect(screen.getByText("1 selected")).toBeTruthy();
});
