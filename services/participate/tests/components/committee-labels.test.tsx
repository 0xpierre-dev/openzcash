import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommitteeLabelEditor, CommitteeLabels } from "@/components/committee-labels";
import { COMMITTEE_LABELS } from "@/lib/domain/committee-labels";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/auth/passkey-client", () => ({ passkeyFetch: mocks.fetch }));
const grant = COMMITTEE_LABELS.find(label => label.name === "📋 Grant Application")!;
const ready = COMMITTEE_LABELS.find(label => label.name === "👀 Ready For ZCG Review")!;
const props = { recordId: "proposal-one", labels: [] as string[], version: 0, canReview: true, canSave: true, demo: false, onSaved: vi.fn(), onReload: vi.fn() };
beforeEach(() => { vi.clearAllMocks(); });

it("shows the whole catalog and filters by category, name and description", () => {
  render(<CommitteeLabelEditor {...props} />);
  expect(screen.getAllByRole("checkbox")).toHaveLength(COMMITTEE_LABELS.length);
  fireEvent.change(screen.getByLabelText("Label category"), { target: { value: "Milestones" } });
  const milestones = screen.getAllByRole("checkbox");
  expect(milestones).toHaveLength(24);
  expect(milestones[1]).toHaveAccessibleName(/Milestone 2 Complete/);
  fireEvent.change(screen.getByLabelText("Label category"), { target: { value: "All" } });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "identity verification" } });
  expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no such label" } });
  expect(screen.getByText("No labels match your search.")).toBeVisible();
});

it("saves multiple selections with an optimistic version and preserves them through filtering", async () => {
  mocks.fetch.mockResolvedValue({ labels: [grant.id, ready.id].sort(), labelsVersion: 1 });
  render(<CommitteeLabelEditor {...props} />);
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(grant.name) }));
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(ready.name) }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Milestone" } });
  fireEvent.click(screen.getByRole("button", { name: "Save labels" }));
  await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith({ labels: [grant.id, ready.id].sort(), labelsVersion: 1 }));
  expect(mocks.fetch).toHaveBeenCalledWith("/api/participate/committee", { action: "labels", recordId: "proposal-one", version: 0, labels: [grant.id, ready.id].sort() });
});

it("can remove the final label and can reset unsaved changes", async () => {
  mocks.fetch.mockResolvedValue({ labels: [], labelsVersion: 4 });
  render(<CommitteeLabelEditor {...props} labels={[grant.id]} version={3} />);
  fireEvent.click(screen.getByRole("button", { name: `Remove ${grant.name}` }));
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("checkbox", { name: new RegExp(grant.name) })).toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: `Remove ${grant.name}` }));
  fireEvent.click(screen.getByRole("button", { name: "Save labels" }));
  await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith({ labels: [], labelsVersion: 4 }));
});

it("preserves changes on failure and requires refresh after a conflict", async () => {
  mocks.fetch.mockRejectedValue(new Error("COMMITTEE_REFRESH_REQUIRED"));
  render(<CommitteeLabelEditor {...props} />);
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(grant.name) }));
  fireEvent.click(screen.getByRole("button", { name: "Save labels" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Labels changed");
  expect(screen.getByRole("checkbox", { name: new RegExp(grant.name) })).toBeChecked();
  expect(screen.getByRole("button", { name: "Save labels" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload labels" }));
  expect(props.onReload).toHaveBeenCalledOnce(); expect(props.onSaved).not.toHaveBeenCalled();
});

it("allows exploring the demo catalog without saving and hides mutation controls from moderators", () => {
  const { rerender } = render(<CommitteeLabelEditor {...props} demo canSave={false} />);
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(grant.name) }));
  expect(screen.getByRole("button", { name: "Save labels" })).toBeDisabled();
  expect(mocks.fetch).not.toHaveBeenCalled();
  rerender(<CommitteeLabelEditor {...props} canReview={false} />);
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save labels" })).not.toBeInTheDocument();
});

it("renders current committee annotations as named color badges", () => {
  render(<CommitteeLabels ids={[grant.id, ready.id]} />);
  expect(screen.getByRole("list", { name: "Committee labels" })).toBeVisible();
  expect(screen.getByText(grant.name)).toHaveStyle({ "--label-color": `#${grant.color}` });
  expect(screen.getByText(ready.name)).toHaveAttribute("title", ready.description);
});
