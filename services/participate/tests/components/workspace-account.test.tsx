import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { WorkspaceAccount } from "@/components/workspace-account";
import type { AccountCreditsView } from "@/lib/domain/participation-credits";

const navigation = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const host = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/components/participate-bridge", () => ({ useParticipateHost: () => host.open }));

const profile = {
  nick: "maya",
  displayName: "Maya",
  avatarUrl: null as string | null,
  shareProfileInDiscussion: true
};

const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  // jsdom does not implement the native dialog lifecycle or browser focus trap.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute("open", ""); }
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    }
  });
});

afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.refresh.mockClear();
  navigation.push.mockClear(); host.open.mockClear();
});

function response(value = profile) {
  return { ok: true, json: async () => ({ profile: value }) };
}

const creditView = {
  accounts: [{ communityId: "orchard", communityName: "Orchard Collective", balance: 25, mode: "CREDITS", commentCost: 1, reactionCost: 1, policyVersion: 1, canManage: false, canClaimPreview: false }],
  sandbox: true, history: []
};
function renderAccount(fetchMock = vi.fn().mockResolvedValue(response())) {
  vi.stubGlobal("fetch", (url: RequestInfo | URL, init?: RequestInit) => String(url).startsWith("/api/account/credits")
    ? Promise.resolve({ ok: true, json: async () => ({ credits: creditView }) })
    : fetchMock(url, init));
  render(<WorkspaceAccount nick="maya" roleLabel="Owner" />);
  return fetchMock;
}

function openMenu() {
  const trigger = screen.getByRole("button", { name: "Account settings" });
  fireEvent.click(trigger);
  return trigger;
}

async function openSettings() {
  const trigger = openMenu();
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  const dialog = await screen.findByRole("dialog", { name: "My profile" });
  return { trigger, dialog };
}

function submittedForm(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
  expect(call?.[0]).toBe("/api/account/settings");
  expect(call?.[1].body).toBeInstanceOf(FormData);
  return call?.[1].body as FormData;
}

it("unlocks pilot moderation in place, independently of the committee preview", async () => {
  const updated = vi.fn(); window.addEventListener("participate:moderation-updated", updated);
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/participate/moderation-access") return { ok: true, json: async () => init?.method === "POST" ? { ok: true } : { active: false } };
    return response();
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<WorkspaceAccount nick="maya" roleLabel="Account" canModeratePilot canPreviewCommittee />);
  await screen.findByText("Maya"); openMenu();
  fireEvent.click(screen.getByRole("button", { name: /^Moderation$/ }));
  expect(screen.getByRole("dialog", { name: "Discussion moderation" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("Admin password"), { target: { value: "synthetic-test-only" } });
  fireEvent.submit(screen.getByRole("button", { name: "Unlock moderation" }).closest("form")!);
  await waitFor(() => expect(updated).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith("/api/participate/moderation-access", expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "synthetic-test-only" }) }));
  expect(host.open).not.toHaveBeenCalled(); expect(navigation.push).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  window.removeEventListener("participate:moderation-updated", updated);
});

describe("Workspace account", () => {
  it("shows the server-loaded profile and balance, loading history only when opened", async () => {
    const initialSummary = { communityId: "zcg", communityName: "ZCG", kind: "COMMITTEE" as const, mode: "CREDITS" as const, balance: 25, commentCost: 1, reactionCost: 1, sandbox: true, paymentReview: false };
    const updatedCredits: AccountCreditsView = { ...creditView, accounts: [{ ...creditView.accounts[0], communityId: "zcg", communityName: "ZCG", kind: "COMMITTEE", mode: "CREDITS", balance: 24 }] };
    let release = () => {};
    const pending = new Promise<{ ok: boolean; json: () => Promise<{ credits: AccountCreditsView }> }>(resolve => { release = () => resolve({ ok: true, json: async () => ({ credits: updatedCredits }) }); });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceAccount nick="maya" roleLabel="Account" creditScope={{ id: "zcg", name: "ZCG", kind: "COMMITTEE" }} initialProfile={profile} initialCreditSummary={initialSummary} />);
    expect(screen.getByText("Maya")).toBeVisible();
    const { dialog } = await openSettings();
    const balance = within(dialog).getByRole("region", { name: "Credit balance" });
    expect(within(balance).getByText("25")).toBeVisible();
    expect(within(dialog).queryByText("Loading your profile…")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Loading your credits…")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Loading credit activity…")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByText("Credit activity"));
    expect(within(dialog).getByText("Loading credit activity…")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/account/credits?communityId=zcg", expect.objectContaining({ cache: "no-store" }));
    act(() => release());
    await waitFor(() => expect(within(within(dialog).getByRole("region", { name: "Credit balance" })).getByText("24")).toBeVisible());
    expect(within(dialog).getByText("No activity yet.")).toBeVisible();
    fireEvent.click(within(dialog).getByText("Credit activity"));
    expect(within(dialog).getByText("Credit activity").closest("details")).not.toHaveAttribute("open");
  });

  it("checks a zero balance automatically so the free demo allowance remains available", async () => {
    const initialSummary = { communityId: "zcg", communityName: "ZCG", kind: "COMMITTEE" as const, mode: "CREDITS" as const, balance: 0, commentCost: 1, reactionCost: 1, sandbox: true, paymentReview: false };
    const availableCredits: AccountCreditsView = { ...creditView, accounts: [{ ...creditView.accounts[0], communityId: "zcg", communityName: "ZCG", kind: "COMMITTEE", mode: "CREDITS", balance: 0, canClaimPreview: true }] };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ credits: availableCredits }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceAccount nick="maya" roleLabel="Account" creditScope={{ id: "zcg", name: "ZCG", kind: "COMMITTEE" }} initialProfile={profile} initialCreditSummary={initialSummary} />);
    const { dialog } = await openSettings();
    expect(await within(dialog).findByRole("button", { name: "Get 25 free Zcred" })).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith("/api/account/credits?communityId=zcg", expect.objectContaining({ cache: "no-store" }));
  });

  it("signs out before returning the host to public proposals", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: true });
    renderAccount(fetchMock); await screen.findByText("Maya"); openMenu();
    fireEvent.submit(screen.getByRole("button", { name: "Sign out" }).closest("form")!);
    await waitFor(() => expect(host.open).toHaveBeenCalledWith("proposals"));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/logout");
    expect(fetchMock.mock.calls[1][1].headers.Accept).toBe("application/json");
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it("keeps the workspace visible and allows retry when sign-out fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: false });
    renderAccount(fetchMock); await screen.findByText("Maya"); openMenu();
    fireEvent.submit(screen.getByRole("button", { name: "Sign out" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out");
    expect(host.open).not.toHaveBeenCalled();
  });
  it("keeps demo switching out of personal profiles", async () => {
    renderAccount(); await screen.findByText("Maya"); openMenu();
    expect(screen.queryByRole("button", { name: /Switch to/ })).not.toBeInTheDocument();
  });
  it("disables the committee switch for the public participant", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response()); vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceAccount nick="participant.preview" roleLabel="Account" demoPersona="participant" />);
    await screen.findByText("Maya"); openMenu();
    const button = screen.getByRole("button", { name: "Switch to committee demo" });
    expect(button).toBeDisabled(); fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledOnce(); expect(host.open).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Committee preview" })).not.toBeInTheDocument();
  });
  it("requires admin password confirmation before opening the same embedded workspace", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) }); vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceAccount nick="admin" roleLabel="Account" canPreviewCommittee />);
    await screen.findByText("Maya"); openMenu(); fireEvent.click(screen.getByRole("button", { name: "Committee preview" }));
    expect(screen.getByRole("dialog", { name: "Committee preview" })).toBeVisible();
    expect(host.open).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Admin password"), { target: { value: "test-only-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Unlock preview" }).closest("form")!);
    await waitFor(() => expect(host.open).toHaveBeenCalledWith("committee"));
    expect(fetchMock.mock.calls[1][0]).toBe("/api/participate/admin-access");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps the existing demo and shows a recoverable error if switching fails", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce({ ok: false, json: async () => ({ error: "DEMO_UNAVAILABLE" }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceAccount nick="maya.preview" roleLabel="Account" demoPersona="committee" />);
    await screen.findByText("Maya"); openMenu();
    fireEvent.click(screen.getByRole("button", { name: "Switch to participant demo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("demo profile is unavailable");
    expect(host.open).not.toHaveBeenCalled(); expect(navigation.push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Switch to participant demo" })).toBeEnabled();
  });
  it("loads the signed-in profile and opens a labelled settings dialog", async () => {
    const fetchMock = renderAccount();
    const { dialog } = await openSettings();
    await waitFor(() => expect(within(dialog).getByLabelText("Display name")).toHaveValue("Maya"));
    expect(fetchMock).toHaveBeenCalledWith("/api/account/settings", expect.objectContaining({ cache: "no-store" }));
    expect(within(dialog).getByLabelText("Profile photo")).toHaveAttribute("type", "file");
    expect(within(dialog).queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("saves profile changes as multipart data and uses the persisted server response", async () => {
    const saved = { ...profile, displayName: "Maya Community" };
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response(saved));
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    const name = within(dialog).getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Maya"));
    fireEvent.change(name, { target: { value: "  Maya Community  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const form = submittedForm(fetchMock);
    expect(form.get("displayName")?.toString().trim()).toBe("Maya Community");
    expect(form.get("shareProfileInDiscussion")).toBe("true");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "My profile" })).not.toBeInTheDocument());
    const reopened = await openSettings();
    expect(within(reopened.dialog).getByLabelText("Display name")).toHaveValue("Maya Community");
  });

  it("edits and reloads the public username separately from the display name", async () => {
    const saved = { ...profile, nick: "maya.community" };
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response(saved));
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    const username = within(dialog).getByLabelText("Username");
    await waitFor(() => expect(username).toHaveValue("maya"));
    fireEvent.change(username, { target: { value: "Maya.Community" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(submittedForm(fetchMock).get("username")).toBe("Maya.Community");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "My profile" })).not.toBeInTheDocument());
    const reopened = await openSettings();
    expect(within(reopened.dialog).getByLabelText("Username")).toHaveValue("maya.community");
  });

  it.each(["network", "server"])("retains unsaved profile data after a %s save failure and allows a retry", async failure => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response())
      .mockImplementationOnce(() => failure === "network"
        ? Promise.reject(new Error("Disconnected"))
        : Promise.resolve({ ok: false, json: async () => ({ error: "INVALID_ACCOUNT_SETTINGS" }) }))
      .mockResolvedValueOnce(response({ ...profile, displayName: "New display name" }));
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    const name = within(dialog).getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Maya"));
    fireEvent.change(name, { target: { value: "New display name" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(name).toHaveValue("New display name");
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeEnabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches[1][1].body.get("displayName")).toBe(patches[0][1].body.get("displayName"));
  });

  it("uploads the selected profile photo without setting a multipart content type", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ ...profile, avatarUrl: "/api/account/avatar/maya" }));
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    await waitFor(() => expect(within(dialog).getByLabelText("Display name")).toHaveValue("Maya"));
    const photo = new File(["png-content"], "portrait.png", { type: "image/png" });
    fireEvent.change(within(dialog).getByLabelText("Profile photo"), { target: { files: [photo] } });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeEnabled());
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const form = submittedForm(fetchMock);
    expect(form.get("avatar")).toBe(photo);
    expect(form.get("removeAvatar")).not.toBe("true");
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(new Headers(patch?.[1].headers).has("content-type")).toBe(false);
  });

  it("includes the selected photo in an immediate save before its preview has loaded", async () => {
    const readPreview = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(() => {
      // Keep onload pending so saving cannot depend on a completed local preview.
    });
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response({
      ...profile, displayName: "New name", avatarUrl: "/api/account/avatar/maya"
    }));
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    const name = within(dialog).getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Maya"));
    fireEvent.change(name, { target: { value: "New name" } });
    const save = within(dialog).getByRole("button", { name: "Save changes" });
    expect(save).toBeEnabled();

    const photo = new File(["delayed-preview"], "portrait.webp", { type: "image/webp" });
    fireEvent.change(within(dialog).getByLabelText("Profile photo"), { target: { files: [photo] } });
    expect(readPreview).toHaveBeenCalledWith(photo);
    expect(within(dialog).queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const form = submittedForm(fetchMock);
    expect(form.get("displayName")).toBe("New name");
    expect(form.get("avatar")).toBe(photo);
    expect(form.get("removeAvatar")).not.toBe("true");
  });

  it("removes an existing photo through an explicit removal flag", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ ...profile, avatarUrl: "/api/account/avatar/maya" })).mockResolvedValueOnce(response());
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    const remove = await within(dialog).findByRole("button", { name: /Remove photo/i });
    fireEvent.click(remove);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const form = submittedForm(fetchMock);
    expect(form.get("removeAvatar")).toBe("true");
    expect(form.get("avatar")).toBeNull();
  });

  it("persists the discussion privacy preference independently of the display name", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ ...profile, shareProfileInDiscussion: false }));
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    const sharing = within(dialog).getByRole("switch", { name: /^Show name and photo in discussions/ });
    await waitFor(() => expect(sharing).toBeChecked());
    fireEvent.click(sharing);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const form = submittedForm(fetchMock);
    expect(form.get("shareProfileInDiscussion")).toBe("false");
    expect(form.get("displayName")).toBe("Maya");
  });

  it.each([
    ["unsupported", () => new File(["<svg></svg>"], "portrait.svg", { type: "image/svg+xml" })],
    ["oversized", () => new File([new Uint8Array(2 * 1024 * 1024 + 1)], "portrait.png", { type: "image/png" })]
  ])("rejects an %s photo without sending it", async (_reason, createPhoto) => {
    const fetchMock = renderAccount();
    const { dialog } = await openSettings();
    await waitFor(() => expect(within(dialog).getByLabelText("Display name")).toHaveValue("Maya"));
    fireEvent.change(within(dialog).getByLabelText("Profile photo"), { target: { files: [createPhoto()] } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/PNG, JPG, or WebP|PNG, JPG or WebP/);
    expect(within(dialog).getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("dismisses the menu with Escape and restores focus after cancelling edits", async () => {
    renderAccount();
    const trigger = openMenu();
    fireEvent.keyDown(screen.getByRole("button", { name: "Profile" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    const { dialog } = await openSettings();
    const name = within(dialog).getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Maya"));
    fireEvent.change(name, { target: { value: "Discard this" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "My profile" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    const reopened = await openSettings();
    expect(within(reopened.dialog).getByLabelText("Display name")).toHaveValue("Maya");
  });

  it("closes the account disclosure on outside interaction without stealing focus", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));
    render(<><WorkspaceAccount nick="maya" roleLabel="Owner" /><button>Outside control</button></>);
    const trigger = openMenu();
    await waitFor(() => expect(trigger).toHaveTextContent("Maya"));
    expect(screen.getByRole("button", { name: "Profile" })).toHaveFocus();
    const outside = screen.getByRole("button", { name: "Outside control" });
    fireEvent.pointerDown(outside);
    act(() => outside.focus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });

  it("handles native dialog cancellation and restores document scrolling", async () => {
    renderAccount();
    const previousOverflow = document.body.style.overflow;
    const { dialog, trigger } = await openSettings();
    expect(document.body.style.overflow).toBe("hidden");
    const dialogOpenWhenFocusReturned: boolean[] = [];
    trigger.addEventListener("focus", () => dialogOpenWhenFocusReturned.push(dialog.hasAttribute("open")), { once: true });
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog", { name: "My profile" })).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe(previousOverflow);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(dialogOpenWhenFocusReturned).toEqual([false]);
  });

  it("blocks dismissal, edits, and duplicate submission while a save is pending", async () => {
    let finish: (value: ReturnType<typeof response>) => void = () => undefined;
    const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockImplementationOnce(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
    renderAccount(fetchMock);
    const { dialog, trigger } = await openSettings();
    const name = within(dialog).getByLabelText("Display name");
    await waitFor(() => expect(name).toHaveValue("Maya"));
    fireEvent.change(name, { target: { value: "Saved name" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(name).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close settings" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Saving…" })).toBeDisabled();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog).toBeInTheDocument();
    fireEvent.submit(name.closest("form")!);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => finish(response({ ...profile, displayName: "Saved name" })));
    expect(screen.queryByRole("dialog", { name: "My profile" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent("Saved name");
  });

  it("offers recovery after the profile could not be loaded", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(response());
    renderAccount(fetchMock);
    const { dialog } = await openSettings();
    const retry = await within(dialog).findByRole("button", { name: /retry|try again|reload/i });
    fireEvent.click(retry);
    await waitFor(() => expect(within(dialog).getByLabelText("Display name")).toHaveValue("Maya"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps profile and privacy settings unavailable to invited accounts", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<WorkspaceAccount nick="Invited member" roleLabel="Invited participant" canEditProfile={false} />);
    openMenu();
    expect(screen.queryByRole("button", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Privacy" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign out/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});


it("keeps credits and privacy in one profile card without losing unsaved edits", async () => {
  renderAccount();
  const trigger = openMenu();
  expect(screen.queryByRole("button", { name: "Credits" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Privacy" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Passkeys" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  const dialog = await screen.findByRole("dialog", { name: "My profile" });
  expect(await within(dialog).findByRole("region", { name: "Credit balance" })).toHaveTextContent("25");
  const name = within(dialog).getByLabelText("Display name");
  fireEvent.change(name, { target: { value: "Still editing" } });
  fireEvent.click(within(dialog).getByText("Credit activity", { exact: true }));
  expect(name).toHaveValue("Still editing");
  expect(within(dialog).getByRole("switch")).toBeChecked();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(dialog.querySelector("form form")).toBeNull();
  fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(trigger).toHaveFocus();
});

it("routes credit requests into the same card with the committee balance", async () => {
  const committee = { ...creditView.accounts[0], communityId: "zcg", communityName: "ZCG", kind: "COMMITTEE", balance: 19 };
  const fetchMock = vi.fn(async (url: string) => url.startsWith("/api/account/credits")
    ? { ok: true, json: async () => ({ credits: { ...creditView, accounts: [...creditView.accounts, committee] } }) }
    : response());
  vi.stubGlobal("fetch", fetchMock);
  render(<WorkspaceAccount nick="maya" roleLabel="Account" communityId="orchard" />);
  await screen.findByText("Maya");
  act(() => { window.dispatchEvent(new CustomEvent("dao:open-credits", { detail: { communityId: "zcg", creditScope: { id: "zcg", name: "ZCG", kind: "COMMITTEE" } } })); });
  const dialog = await screen.findByRole("dialog", { name: "My profile" });
  const balance = await within(dialog).findByRole("region", { name: "Credit balance" });
  expect(balance).toHaveTextContent("19");
  expect(balance).toHaveTextContent("ZCG");
  expect(dialog).not.toHaveTextContent("Orchard Collective");
  expect(within(dialog).getByLabelText("Display name")).toHaveValue("Maya");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith("/api/account/credits?communityId=zcg", expect.objectContaining({ cache: "no-store" }));
});
