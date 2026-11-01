import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ParticipationCreditsDialog } from "@/components/participation-credits";
import type { AccountCreditsView } from "@/lib/domain/participation-credits";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/components/credit-topup", () => ({ CreditTopUp: () => <p>Demo Zcred are free. No payment required.</p> }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const account = { communityId: "orchard", communityName: "Orchard Collective", balance: 25, mode: "FREE" as const, commentCost: 1, reactionCost: 1, policyVersion: 4, canManage: true, canClaimPreview: true };
const view: AccountCreditsView = { accounts: [account], sandbox: true, history: [] };
const result = (credits = view) => ({ ok: true, json: async () => ({ credits }) });
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});
afterEach(() => { vi.unstubAllGlobals(); navigation.refresh.mockClear(); });

async function setup(fetchMock = vi.fn().mockResolvedValue(result()), communityId = "orchard") {
  vi.stubGlobal("fetch", fetchMock);
  const onClose = vi.fn();
  render(<ParticipationCreditsDialog communityId={communityId} onClose={onClose} />);
  await screen.findByRole("region", { name: "Credit balance" });
  return { fetchMock, onClose };
}

describe("Participation credit account", () => {
  it("opens committee credits without a DAO selector or balance fallback", async () => {
    const committee = { ...account, communityId: "zcg", communityName: "ZCG", kind: "COMMITTEE" as const, balance: 0 };
    const fetchMock = vi.fn().mockResolvedValue(result({ ...view, accounts: [account, committee] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ParticipationCreditsDialog communityId="zcg" scope={{ id: "zcg", name: "ZCG", kind: "COMMITTEE" }} onClose={vi.fn()} />);
    const balance = await screen.findByRole("region", { name: "Credit balance" });
    expect(balance).toHaveTextContent("0");
    expect(screen.getByText("Committee", { exact: true })).toBeVisible();
    expect(screen.getByText("ZCG", { exact: true })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Community" })).not.toBeInTheDocument();
    expect(screen.queryByText("Orchard Collective")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/account/credits?communityId=zcg", expect.objectContaining({ cache: "no-store" }));
  });

  it("keeps committee accounts outside the DAO selector", async () => {
    await setup(vi.fn().mockResolvedValue(result({ ...view, accounts: [
      account, { ...account, communityId: "river", communityName: "River Commons" },
      { ...account, communityId: "zcg", communityName: "ZCG", kind: "COMMITTEE" as const }
    ] })));
    expect(screen.getByRole("combobox", { name: "Community" })).toHaveValue("orchard");
    expect(screen.queryByRole("option", { name: "ZCG" })).not.toBeInTheDocument();
  });

  it("shows private credits distinctly from unavailable ZEC funding", async () => {
    const { fetchMock } = await setup();
    expect(screen.getByRole("region", { name: "Credit balance" })).toHaveTextContent("25");
    expect(within(screen.getByRole("region", { name: "Credit balance" })).getByText("Demo")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Credit balance" })).getByText("Zcred")).toBeInTheDocument();
    expect(screen.getByText("Demo Zcred are free. No payment required.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /buy|pay with|send zec/i })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/account/credits", expect.objectContaining({ cache: "no-store" }));
  });

  it("selects the current DAO instead of mixing balances", async () => {
    const credits = { ...view, accounts: [account, { ...account, communityId: "river", communityName: "River Commons", balance: 8 }] };
    await setup(vi.fn().mockResolvedValue(result(credits)), "river");
    expect(screen.getByRole("combobox", { name: "Community" })).toHaveValue("river");
    expect(screen.getByRole("region", { name: "Credit balance" })).toHaveTextContent("8");
    fireEvent.change(screen.getByRole("combobox", { name: "Community" }), { target: { value: "orchard" } });
    expect(screen.getByRole("region", { name: "Credit balance" })).toHaveTextContent("25");
  });

  it("retries the one-time demo claim without sending a client-controlled amount", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(result()).mockRejectedValueOnce(new Error("Disconnected"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ credits: view, replayed: true }) })
      .mockResolvedValueOnce(result({ ...view, accounts: [{ ...account, canClaimPreview: false }] }));
    await setup(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Get 25 free Zcred" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("retry");
    fireEvent.click(screen.getByRole("button", { name: "Get 25 free Zcred" }));
    expect(await screen.findByText("Your demo Zcred have already been added.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Loading your credits…")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Get 25 free Zcred" })).not.toBeInTheDocument();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts.map(([, init]) => JSON.parse(init.body))).toEqual([{ communityId: "orchard" }, { communityId: "orchard" }]);
  });

  it("does not offer demo grants or paid activation outside the sandbox", async () => {
    await setup(vi.fn().mockResolvedValue(result({ ...view, sandbox: false, accounts: [{ ...account, canClaimPreview: false }] })));
    expect(screen.queryByRole("button", { name: "Get 25 free Zcred" })).not.toBeInTheDocument();
    const details = screen.getByText("Settings").closest("details")!;
    fireEvent.click(within(details).getByText("Settings"));
    expect(within(details).queryByRole("option", { name: /Use credits/ })).not.toBeInTheDocument();
  });

  it("sends versioned policy changes and does not discard a conflict", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(result()).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "PARTICIPATION_POLICY_CHANGED" }) });
    await setup(fetchMock);
    const details = screen.getByText("Settings").closest("details")!;
    fireEvent.click(within(details).getByText("Settings"));
    fireEvent.change(within(details).getByLabelText("Discussion access"), { target: { value: "CREDITS" } });
    fireEvent.change(within(details).getByLabelText("Zcred per comment"), { target: { value: "3" } });
    fireEvent.click(within(details).getByRole("button", { name: "Save policy" }));
    expect(await within(details).findByRole("alert")).toHaveTextContent("policy has changed");
    expect(within(details).getByLabelText("Zcred per comment")).toHaveValue(3);
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(patch![1].body)).toEqual({ mode: "CREDITS", commentCost: 3, reactionCost: 1, expectedVersion: 4 });
  });

  it("hides policy management from participants", async () => {
    await setup(vi.fn().mockResolvedValue(result({ ...view, accounts: [{ ...account, canManage: false }] })));
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("refreshes credits after discussion activity without closing", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(result()).mockResolvedValueOnce(result({ ...view, accounts: [{ ...account, balance: 24 }] }));
    await setup(fetchMock);
    act(() => window.dispatchEvent(new CustomEvent("dao:participation-updated")));
    await waitFor(() => expect(screen.getByRole("region", { name: "Credit balance" })).toHaveTextContent("24"));
    expect(screen.getByRole("dialog", { name: "Credits" })).toBeInTheDocument();
  });
  it("hides stale balances, blocks changes, and offers retry after a background read fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(result()).mockRejectedValueOnce(new Error("Refresh unavailable"))
      .mockResolvedValueOnce(result({ ...view, accounts: [{ ...account, balance: 23 }] }));
    await setup(fetchMock);
    fireEvent.click(screen.getByText("Settings"));
    fireEvent.change(screen.getByLabelText("Discussion access"), { target: { value: "CREDITS" } });
    act(() => window.dispatchEvent(new CustomEvent("dao:participation-updated")));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh unavailable");
    expect(screen.getByRole("region", { name: "Credit balance" })).toHaveTextContent("Unavailable");
    expect(screen.getByRole("button", { name: "Get 25 free Zcred" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save policy" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Credit balance" })).toHaveTextContent("23"));
    expect(screen.getByLabelText("Discussion access")).toHaveValue("CREDITS");
    expect(screen.getByRole("button", { name: "Save policy" })).toBeEnabled();
  });

  it("restores focus after closing the native modal when its menu opener was removed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result()));
    const restoreFocus = vi.fn(() => expect(document.querySelector("dialog[open]")).toBeNull());
    const { unmount } = render(<ParticipationCreditsDialog communityId="orchard" onClose={vi.fn()} restoreFocus={restoreFocus} />);
    await screen.findByRole("region", { name: "Credit balance" });
    unmount();
    expect(restoreFocus).toHaveBeenCalledOnce();
  });

});
