import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CommunityMembers, type WorkspaceMember } from "@/components/community-members";
import { AdminDaoMembersBootstrapForm } from "@/components/admin-dao-members-bootstrap-form";

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

const community = { id: "community-a", name: "Community A", slug: "community-a" };
const viewer = { nick: "Owner", role: "OWNER" as const };
const members: WorkspaceMember[] = [
  { id: "alice", nick: "Alice", signalUsername: "alice_signal.99", status: "ACTIVE", addedByPollId: null, removedByPollId: null },
  { id: "bob", nick: "Bob", signalUsername: "bob_signal.42", status: "REMOVED", addedByPollId: "poll-added-bob", removedByPollId: "poll-removed-bob" },
  { id: "carol", nick: "Carol", signalUsername: "carol_signal.81", status: "ACTIVE", addedByPollId: "poll-added-carol", removedByPollId: null }
];

function renderMembers(roster = members) {
  return render(<CommunityMembers community={community} communities={[community]} viewer={viewer} members={roster} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.refresh.mockClear();
  navigation.push.mockClear();
  window.history.replaceState({}, "", "/");
});

describe("Community members", () => {
  it("links changes and membership sources to the selected community", () => {
    renderMembers();
    expect(screen.getByRole("heading", { name: "Members", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /Propose change/ })).toHaveAttribute("href", "/communities/community-a/members/change");

    const initialRow = screen.getByRole("row", { name: /Alice Legacy invitation/ });
    expect(within(initialRow).getByText("Initial roster")).toBeInTheDocument();
    expect(within(initialRow).queryByRole("link")).not.toBeInTheDocument();
    const addedRow = screen.getByRole("row", { name: /Carol Legacy invitation/ });
    expect(within(addedRow).getByRole("link", { name: /Membership proposal/ })).toHaveAttribute("href", "/communities/community-a/proposals/poll-added-carol");
    const removedRow = screen.getByRole("row", { name: /Bob Legacy invitation/ });
    expect(within(removedRow).getByRole("link", { name: /Removal proposal/ })).toHaveAttribute("href", "/communities/community-a/proposals/poll-removed-bob");
    expect(within(removedRow).queryByRole("link", { name: /Membership proposal/ })).not.toBeInTheDocument();
  });

  it("filters active and removed members without changing the roster", () => {
    renderMembers();
    expect(screen.getByRole("status")).toHaveTextContent("3 members shown");
    fireEvent.click(screen.getByRole("button", { name: /^Active/ }));
    expect(screen.getByRole("row", { name: /Alice Legacy invitation/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Carol Legacy invitation/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Bob Legacy invitation/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Active/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("2 members shown");

    fireEvent.click(screen.getByRole("button", { name: /^Removed/ }));
    expect(screen.getByRole("row", { name: /Bob Legacy invitation/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Alice Legacy invitation/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 member shown");
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByRole("status")).toHaveTextContent("3 members shown");
  });

  it("searches names and Signal usernames together with the selected status", () => {
    renderMembers();
    const search = screen.getByRole("searchbox", { name: "Search members" });
    fireEvent.change(search, { target: { value: "  ALICE  " } });
    expect(screen.getByRole("row", { name: /Alice Legacy invitation/ })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /Bob Legacy invitation/ })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "BOB_SIGNAL.42" } });
    expect(screen.getByRole("row", { name: /Bob Legacy invitation/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Active/ }));
    expect(screen.getByText("No matching members.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Initial members" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Propose change/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Removed/ }));
    expect(screen.getByRole("row", { name: /Bob Legacy invitation/ })).toBeInTheDocument();
  });

  it("offers initial setup only when the community roster is truly empty", () => {
    const view = renderMembers([]);
    expect(screen.getByRole("checkbox", { name: "Owner · My account" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Create initial roster" })).toBeEnabled();
    expect(screen.queryByRole("textbox", { name: "Initial members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Propose change/ })).not.toBeInTheDocument();
    view.rerender(<CommunityMembers community={community} communities={[community]} viewer={viewer} members={[members[0]]} />);
    fireEvent.click(screen.getByRole("button", { name: /^Removed/ }));
    expect(screen.getByText("No matching members.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Initial members" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create member list" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search members" }), { target: { value: "No such member" } });
    expect(screen.getByText("No matching members.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Initial members" })).not.toBeInTheDocument();
  });
});

describe("Initial member list", () => {
  const entries = "alice,alice_signal.99\nbob,bob_signal.42";

  it("submits the exact community and entered member list, then refreshes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ created: 2 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminDaoMembersBootstrapForm communityId={community.id} />);
    const input = screen.getByRole("textbox", { name: "Initial members" });
    fireEvent.change(input, { target: { value: entries } });
    fireEvent.click(screen.getByRole("button", { name: "Create member list" }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/admin/dao-members/bootstrap");
    expect(request.method).toBe("POST");
    expect(request.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(request.body)).toEqual({ communityId: community.id, members: entries });
    expect(input).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retains entries after a connection failure and retries the same payload", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Disconnected")).mockResolvedValueOnce({ ok: true, json: async () => ({ created: 2 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminDaoMembersBootstrapForm communityId={community.id} />);
    const input = screen.getByRole("textbox", { name: "Initial members" });
    fireEvent.change(input, { target: { value: entries } });
    fireEvent.click(screen.getByRole("button", { name: "Create member list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection interrupted");
    expect(input).toHaveValue(entries);
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create member list" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Create member list" }));
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ communityId: community.id, members: entries });
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it("shows a permission error without losing the submitted entries or refreshing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "forbidden" }) }));
    render(<AdminDaoMembersBootstrapForm communityId={community.id} />);
    const input = screen.getByRole("textbox", { name: "Initial members" });
    fireEvent.change(input, { target: { value: entries } });
    fireEvent.click(screen.getByRole("button", { name: "Create member list" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to set up this member list.");
    expect(input).toHaveValue(entries);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(navigation.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create member list" })).toBeEnabled();
  });

  it("prevents a second submission and edits while the initial list is being created", async () => {
    let finish: () => void = () => undefined;
    const fetchMock = vi.fn(() => new Promise(resolve => {
      finish = () => resolve({ ok: false, json: async () => ({ error: "DAO_MEMBER_BOOTSTRAP_LOCKED" }) });
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminDaoMembersBootstrapForm communityId={community.id} />);
    const input = screen.getByRole("textbox", { name: "Initial members" });
    fireEvent.change(input, { target: { value: entries } });
    fireEvent.click(screen.getByRole("button", { name: "Create member list" }));
    expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Creating…" })).toBeDisabled();
    fireEvent.submit(input.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish();
    expect(await screen.findByRole("alert")).toHaveTextContent("The member list is already set up.");
    expect(input).toBeEnabled();
    expect(input).toHaveValue(entries);
    expect(navigation.refresh).not.toHaveBeenCalled();
  });
});
