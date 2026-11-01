import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityProposalForm } from "@/components/community-proposal-form";
import { PROPOSAL_TEMPLATES } from "@/lib/domain/proposal-templates";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const funds = [{ id: "alpha-fund", name: "Community Treasury" }];
const draft = { id: "proposal-a", title: "A complete community proposal", body: "Specific deliverables, dates, and a complete budget for our community.", treasuryId: "alpha-fund", requestedAmountUsd: "1234.56", opensAt: "2026-11-01T10:00:00.000Z", closesAt: "2026-11-03T10:00:00.000Z" };

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

async function readyDates() {
  await waitFor(() => expect(screen.getByLabelText("Voting opens")).not.toHaveValue(""));
}

it("requires an explicit USD budget when editing a legacy ZEC draft", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={{ ...draft, requestedAmountUsd: undefined, requestedAmountZec: "24" }} />);
  await readyDates();
  expect(screen.getByLabelText("Requested amount · USD")).toHaveValue("");
  expect(screen.getByText(/Previous budget: 24 ZEC/)).toBeInTheDocument();
  expect(screen.getByText("Payable in ZEC at the payment-day rate.")).toBeInTheDocument();
  fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("positive USD amount");
  expect(fetchMock).not.toHaveBeenCalled();
});

function markdownFile(text: string | Uint8Array, name = "proposal.md") {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], name, { type: "text/markdown" });
  Object.defineProperty(file, "arrayBuffer", { value: vi.fn().mockResolvedValue(buffer) });
  return file;
}

function importFile(file: File) {
  fireEvent.change(screen.getByLabelText("Import Markdown file"), { target: { files: [file] } });
}

describe("community proposal form", () => {
  it.each(["network", "server", "malformed-success"])("keeps uncertain %s saves from being submitted again", async failure => {
    const fetchMock = vi.fn();
    if (failure === "network") fetchMock.mockRejectedValue(new Error("offline"));
    else fetchMock.mockResolvedValue(new Response("invalid response", { status: failure === "server" ? 500 : 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    const form = screen.getByRole("button", { name: "Save changes" }).closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByRole("alert")).toHaveTextContent(/saved/);
    expect(screen.getByRole("link", { name: /Check saved proposals/ })).toHaveAttribute("href", "/communities/alpha/proposals/proposal-a");
    fireEvent.submit(form);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
  it("submits an exact decimal funding request to the scoped draft-save endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: { id: draft.id } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/communities/alpha/proposals/proposal-a"));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/communities/alpha/proposals/proposal-a");
    expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({ title: draft.title, body: draft.body, treasuryId: "alpha-fund", requestedAmountUsd: "1234.56", opensAt: draft.opensAt, closesAt: draft.closesAt });
  });

  it("removes both funding fields when the user chooses no funding", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: { id: draft.id } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    fireEvent.change(screen.getByLabelText("Funding source"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).not.toHaveProperty("treasuryId");
    expect(payload).not.toHaveProperty("requestedAmountUsd");
  });

  it("keeps typed content after a retryable save conflict", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "CONCURRENT_UPDATE" }) }));
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    fireEvent.change(screen.getByLabelText("The proposal"), { target: { value: "An unsaved revised description with specific community deliverables." } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Another update occurred");
    expect(screen.getByLabelText("The proposal")).toHaveValue("An unsaved revised description with specific community deliverables.");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("reports a short voting window as an input problem before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    const opens = (screen.getByLabelText("Voting opens") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("Voting closes"), { target: { value: opens } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose valid voting dates");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("locks editable fields during a save and restores them after failure", async () => {
    let finish: (response: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(resolve => { finish = resolve; })));
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    for (const label of ["Proposal title", "The proposal", "Funding source", "Requested amount · USD", "Voting opens", "Voting closes", "Proposal template", "Import Markdown file"]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    for (const name of ["Import .md", "Use template", "Download .md", "Preview", "Write", "Security"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    fireEvent.click(screen.getByRole("button", { name: "Use template" }));
    const file = markdownFile("# A replacement that must not load while the current proposal is saving.");
    importFile(file);
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Replace proposal text" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
    finish({ ok: false, json: async () => ({ error: "CONCURRENT_UPDATE" }) });
    await screen.findByRole("alert");
    expect(screen.getByLabelText("The proposal")).toBeEnabled();
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
  });

  it("limits tags to three, permits removing a selected tag, and saves the revised set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: { id: draft.id } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={{ ...draft, tags: ["security", "community"] }} />);
    await readyDates();
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Education" }));
    expect(screen.getByRole("button", { name: "Wallets" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Security" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Wallets" }));
    expect(screen.getByRole("button", { name: "Wallets" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Wallets" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Wallets" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).tags).toEqual(["community", "education", "wallets"]);
  });

  it("requires confirmation before replacing a draft with a template and preserves other fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: { id: draft.id } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={{ ...draft, tags: ["community"] }} />);
    await readyDates();
    const title = "A locally edited proposal title";
    fireEvent.change(screen.getByLabelText("Proposal title"), { target: { value: title } });
    fireEvent.change(screen.getByLabelText("Requested amount · USD"), { target: { value: "2500.01" } });
    const opens = (screen.getByLabelText("Voting opens") as HTMLInputElement).value;
    const closes = (screen.getByLabelText("Voting closes") as HTMLInputElement).value;
    fireEvent.change(screen.getByLabelText("Proposal template"), { target: { value: "retroactive-grant" } });
    fireEvent.click(screen.getByRole("button", { name: "Use template" }));
    expect(screen.getByRole("group", { name: "Replace proposal text" })).toBeInTheDocument();
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Keep my text" }));
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Use template" }));
    fireEvent.click(screen.getByRole("button", { name: "Replace text" }));
    expect(screen.getByLabelText("The proposal")).toHaveValue(PROPOSAL_TEMPLATES.find(template => template.id === "retroactive-grant")!.body);
    expect(screen.getByLabelText("Proposal title")).toHaveValue(title);
    expect(screen.getByLabelText("Funding source")).toHaveValue("alpha-fund");
    expect(screen.getByLabelText("Requested amount · USD")).toHaveValue("2500.01");
    expect(screen.getByLabelText("Voting opens")).toHaveValue(opens);
    expect(screen.getByLabelText("Voting closes")).toHaveValue(closes);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ title, treasuryId: "alpha-fund", requestedAmountUsd: "2500.01", opensAt: draft.opensAt, closesAt: draft.closesAt, tags: ["community"] });
  });

  it("loads a template immediately when the proposal text is empty", async () => {
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={{ ...draft, body: "" }} />);
    await readyDates();
    fireEvent.click(screen.getByRole("button", { name: "Use template" }));
    expect(screen.queryByRole("group", { name: "Replace proposal text" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("The proposal")).toHaveValue(PROPOSAL_TEMPLATES[0].body);
    expect(screen.getByLabelText("Proposal title")).toHaveValue(draft.title);
  });

  it("saves the exact Markdown source from preview without a hidden required field blocking submission", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ proposal: { id: draft.id } }) });
    vi.stubGlobal("fetch", fetchMock);
    const body = "# Workshop schedule\n\n- [x] Team ready\n- [ ] Publish **public materials**\n\n| Task | ZEC |\n| --- | ---: |\n| Workshop | 1 |";
    const { container } = render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={{ ...draft, body }} />);
    await readyDates();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("heading", { name: "Workshop schedule" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByLabelText("The proposal")).not.toBeVisible();
    expect(screen.getByLabelText("The proposal")).not.toBeRequired();
    expect(container.querySelector("form")!.checkValidity()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).body).toBe(body);
  });

  it("returns to the visible editor with a useful error when an empty preview is submitted", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={{ ...draft, body: "" }} />);
    await readyDates();
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByLabelText("The proposal")).not.toBeRequired();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("between 20 and 40,000 characters");
    expect(screen.getByLabelText("The proposal")).toBeVisible();
    expect(screen.getByLabelText("The proposal")).toHaveValue("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("imports UTF-8 Markdown as body text only after confirming replacement", async () => {
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    const body = "# Community café\n\nLearn about private Zcash payments.\n\nrequestedAmountUsd: 999\n\n- [ ] Publish the résumé";
    importFile(markdownFile(body));
    expect(await screen.findByRole("group", { name: "Replace proposal text" })).toBeInTheDocument();
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
    fireEvent.click(screen.getByRole("button", { name: "Replace text" }));
    expect(screen.getByLabelText("The proposal")).toHaveValue(body);
    expect(screen.getByLabelText("Proposal title")).toHaveValue(draft.title);
    expect(screen.getByLabelText("Funding source")).toHaveValue("alpha-fund");
    expect(screen.getByLabelText("Requested amount · USD")).toHaveValue(draft.requestedAmountUsd);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("protects the draft during a slow file read and restores editing after a read failure", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let rejectRead: (error: Error) => void = () => {};
    const file = new File(["# An unreadable proposal file"], "proposal.md", { type: "text/markdown" });
    Object.defineProperty(file, "arrayBuffer", { value: () => new Promise<ArrayBuffer>((_resolve, reject) => { rejectRead = reject; }) });
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    importFile(file);
    expect(screen.getByRole("button", { name: "Importing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use template" })).toBeDisabled();
    expect(screen.getByLabelText("The proposal")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(fetchMock).not.toHaveBeenCalled();
    rejectRead(new Error("File could not be read"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your current text is unchanged");
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
    expect(screen.getByLabelText("The proposal")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it.each([
    { label: "non-Markdown file", content: "# Proposal text should not replace this draft.", name: "proposal.html" },
    { label: "oversized byte content", content: "x".repeat(160_001), name: "proposal.md" },
    { label: "too many characters", content: "x".repeat(40_001), name: "proposal.md" },
    { label: "empty text", content: " \n \t", name: "proposal.md" },
    { label: "embedded null", content: "# Invalid proposal with \0 hidden content.", name: "proposal.md" },
    { label: "invalid UTF-8", content: new Uint8Array([0xc3, 0x28]), name: "proposal.md" }
  ])("preserves the current draft when importing $label", async ({ content, name }) => {
    render(<CommunityProposalForm communityId="alpha" funds={funds} memberCount={0} initialProposal={draft} />);
    await readyDates();
    importFile(markdownFile(content, name));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Markdown/);
    expect(screen.getByLabelText("The proposal")).toHaveValue(draft.body);
    expect(screen.getByLabelText("Proposal title")).toHaveValue(draft.title);
    expect(screen.getByLabelText("Requested amount · USD")).toHaveValue(draft.requestedAmountUsd);
    expect(screen.queryByRole("group", { name: "Replace proposal text" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });
});
