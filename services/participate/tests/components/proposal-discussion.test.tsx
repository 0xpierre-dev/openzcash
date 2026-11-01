import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProposalDiscussion, type DiscussionComment, type DiscussionPolicy } from "@/components/proposal-discussion";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

afterAll(() => {
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

const comment: DiscussionComment = {
  id: "comment-a", parentId: null, authorLabel: "Alice", createdAt: "2026-10-08T10:00:00Z",
  body: "A question for the community.", hidden: false, moderation: null,
  reaction: { count: 2, likedByMe: false, chargedBefore: false }
};
const capabilities = { canPost: true, canReact: true, canModerate: false };
const policy: DiscussionPolicy = {
  visibility: "INVITED_PARTICIPANTS", immutable: true, maxLength: 4000, readOnly: false,
  participation: { communityId: "community-a", mode: "CREDITS", commentCost: 1, reactionCost: 1, version: 1, availableCredits: 25, sponsored: false, sandbox: true }
};

function response(value: unknown, ok = true) {
  return { ok, json: async () => value };
}

function discussion(comments = [comment], availableCredits = 25, nextPolicy = policy) {
  return { comments, capabilities, policy: { ...nextPolicy, participation: { ...nextPolicy.participation!, availableCredits } } };
}

function renderDiscussion(fetchMock = vi.fn(), nextPolicy = policy, comments = [comment]) {
  vi.stubGlobal("fetch", fetchMock);
  return render(<ProposalDiscussion pollId="poll-a" initialComments={comments} capabilities={capabilities} policy={nextPolicy} />);
}

function draft(text = "A thoughtful proposal response.") {
  fireEvent.change(screen.getByRole("textbox"), { target: { value: text } });
}

function posts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  navigation.refresh.mockClear();
});

describe("Discussion participation", () => {
  it("shows a comment like at once and restores it after a rejected write", async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    const fetchMock = vi.fn(() => new Promise<ReturnType<typeof response>>(resolve => { finish = resolve; }));
    renderDiscussion(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes. 1 Zcred" }));
    const pending = screen.getByRole("button", { name: "Remove like from Alice’s comment. 3 likes" });
    expect(pending).toHaveAttribute("aria-pressed", "true");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).toHaveStyle({ opacity: "1" });
    expect(within(pending).getByText("3")).toBeVisible();
    expect(within(pending).queryByText("…")).not.toBeInTheDocument();
    fireEvent.click(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(response({ error: "REACTION_RATE_LIMIT" }, false)));
    expect(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes. 1 Zcred" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes. 1 Zcred" })).toHaveAttribute("aria-busy", "false");
    expect(screen.getByRole("alert")).toHaveTextContent("Please wait before trying again");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses the confirmed archive balance and like without another discussion request", async () => {
    const liked = { ...comment, reaction: { count: 3, likedByMe: true, chargedBefore: true } };
    const nextParticipation = { ...policy.participation!, availableCredits: 24 };
    const fetchMock = vi.fn().mockResolvedValue(response({ comment: liked, participation: nextParticipation }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProposalDiscussion pollId="record-a" commentsEndpoint="/api/communities/community-a/archives/record-a/comments"
      initialComments={[comment]} capabilities={capabilities} policy={policy} />);
    fireEvent.click(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes. 1 Zcred" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove like from Alice’s comment. 3 likes" })).toBeEnabled());
    expect(screen.getByText("24 Zcred available")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discloses comment and first-like costs before an action, with the real balance and demo status", () => {
    const fetchMock = vi.fn();
    renderDiscussion(fetchMock);
    expect(screen.getByText("25 Zcred available")).toBeInTheDocument();
    expect(screen.getByText("Demo Zcred")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish · 1 Zcred" })).toBeDisabled();
    const like = screen.getByRole("button", { name: "Like Alice’s comment. 2 likes. 1 Zcred" });
    expect(like).toHaveAttribute("aria-pressed", "false");
    expect(like).toHaveAttribute("title", "Like · 1 Zcred");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps sponsored guests free and omits the account credits action", () => {
    renderDiscussion(vi.fn(), { ...policy, participation: { ...policy.participation!, sponsored: true, availableCredits: null } });
    expect(screen.getByText("Participation sponsored")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish comment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Credits" })).not.toBeInTheDocument();
    expect(screen.queryByText("Demo Zcred")).not.toBeInTheDocument();
  });

  it("retries an interrupted comment with the same payload and refreshes the canonical balance", async () => {
    const saved = { ...comment, id: "new-comment", body: "A thoughtful proposal response." };
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Disconnected"))
      .mockResolvedValueOnce(response({ comment: saved }))
      .mockResolvedValueOnce(response(discussion([comment, saved], 24)));
    renderDiscussion(fetchMock);
    draft();
    fireEvent.click(screen.getByRole("button", { name: "Publish · 1 Zcred" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Retry to safely check and complete the same request");
    expect(screen.getByRole("textbox")).toHaveValue(saved.body);
    fireEvent.click(screen.getByRole("button", { name: "Publish · 1 Zcred" }));
    await screen.findByText("24 Zcred available");
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByText("Comment published.")).toBeInTheDocument();
    const [first, second] = posts(fetchMock).map(([, init]) => JSON.parse(init.body));
    expect(second).toEqual(first);
    expect(first).toMatchObject({ body: saved.body, parentId: null, policyVersion: 1 });
    expect(first.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/polls/poll-a/comments", { cache: "no-store" });
  });

  it("creates a different request key when the author changes a failed comment", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Disconnected"));
    renderDiscussion(fetchMock);
    draft("First draft");
    fireEvent.click(screen.getByRole("button", { name: "Publish · 1 Zcred" }));
    await screen.findByRole("alert");
    draft("Revised draft");
    fireEvent.click(screen.getByRole("button", { name: "Publish · 1 Zcred" }));
    await screen.findByRole("alert");
    const [first, second] = posts(fetchMock).map(([, init]) => JSON.parse(init.body));
    expect(second.requestKey).not.toBe(first.requestKey);
    expect(second.body).toBe("Revised draft");
  });

  it("blocks duplicate submissions and simultaneous likes while a comment request is pending", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    renderDiscussion(fetchMock);
    draft();
    const form = screen.getByRole("textbox").closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(posts(fetchMock)).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Like Alice/ })).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    await act(async () => finish(response({ error: "INVALID_COMMENT_INPUT" }, false)));
    expect(screen.getByRole("textbox")).toBeEnabled();
  });

  it("preserves the draft and reply target while opening credits after an insufficient-balance response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: "INSUFFICIENT_PARTICIPATION_CREDITS" }, false))
      .mockResolvedValueOnce(response(discussion([comment], 30)));
    const openCredits = vi.fn();
    window.addEventListener("dao:open-credits", openCredits, { once: true });
    renderDiscussion(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Reply to Alice" }));
    draft("My reply stays here.");
    fireEvent.click(screen.getByRole("button", { name: "Publish reply · 1 Zcred" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Get Zcred" }));
    expect(openCredits).toHaveBeenCalledTimes(1);
    expect((openCredits.mock.calls[0][0] as CustomEvent).detail).toEqual({ communityId: "community-a" });
    expect(screen.getByRole("textbox", { name: "Reply to Alice" })).toHaveValue("My reply stays here.");
    await act(async () => window.dispatchEvent(new CustomEvent("dao:credits-updated", { detail: { communityId: "community-a" } })));
    await screen.findByText("30 Zcred available");
    expect(screen.getByRole("textbox", { name: "Reply to Alice" })).toHaveValue("My reply stays here.");
    window.removeEventListener("dao:open-credits", openCredits);
  });

  it("refreshes changed policy without posting automatically, then uses the reviewed version and cost", async () => {
    const nextPolicy = { ...policy, participation: { ...policy.participation!, commentCost: 3, version: 2 } };
    const saved = { ...comment, id: "new-comment", body: "A thoughtful proposal response." };
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: "PARTICIPATION_POLICY_CHANGED" }, false))
      .mockResolvedValueOnce(response(discussion([comment], 25, nextPolicy)))
      .mockResolvedValueOnce(response({ comment: saved }))
      .mockResolvedValueOnce(response(discussion([comment, saved], 22, nextPolicy)));
    renderDiscussion(fetchMock);
    draft();
    fireEvent.click(screen.getByRole("button", { name: "Publish · 1 Zcred" }));
    await screen.findByRole("button", { name: "Publish · 3 Zcred" });
    expect(posts(fetchMock)).toHaveLength(1);
    expect(screen.getByRole("textbox")).toHaveValue(saved.body);
    fireEvent.click(screen.getByRole("button", { name: "Publish · 3 Zcred" }));
    await screen.findByText("22 Zcred available");
    const [first, second] = posts(fetchMock).map(([, init]) => JSON.parse(init.body));
    expect(second.policyVersion).toBe(2);
    expect(second.requestKey).not.toBe(first.requestKey);
  });

  it("queues a credit update received during a pending action and retains the draft", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(response(discussion([comment], 30)));
    renderDiscussion(fetchMock);
    draft();
    fireEvent.click(screen.getByRole("button", { name: "Publish · 1 Zcred" }));
    fireEvent(window, new CustomEvent("dao:credits-updated", { detail: { communityId: "community-a" } }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish(response({ error: "INVALID_COMMENT_INPUT" }, false)));
    await screen.findByText("30 Zcred available");
    expect(screen.getByRole("textbox")).toHaveValue("A thoughtful proposal response.");
  });

  it("retries an interrupted like with the same key after restoring the previous count", async () => {
    const liked = { ...comment, reaction: { count: 3, likedByMe: true, chargedBefore: true } };
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Disconnected"))
      .mockResolvedValueOnce(response({ comment: liked }))
      .mockResolvedValueOnce(response(discussion([liked], 24)));
    renderDiscussion(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: /^Like Alice/ }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: /^Like Alice’s comment. 2 likes/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^Like Alice’s comment. 2 likes/ })).toHaveAttribute("aria-busy", "false");
    fireEvent.click(screen.getByRole("button", { name: /^Like Alice/ }));
    await screen.findByText("24 Zcred available");
    expect(screen.getByRole("button", { name: "Remove like from Alice’s comment. 3 likes" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove like from Alice’s comment. 3 likes" })).toHaveAttribute("aria-busy", "false"));
    const requests = posts(fetchMock);
    expect(requests[0][0]).toBe("/api/polls/poll-a/comments/comment-a/reaction");
    expect(JSON.parse(requests[0][1].body)).toEqual(JSON.parse(requests[1][1].body));
    expect(JSON.parse(requests[0][1].body)).toMatchObject({ liked: true, policyVersion: 1 });
  });

  it("removes and restores a previously charged like without advertising another charge", async () => {
    const liked = { ...comment, reaction: { count: 3, likedByMe: true, chargedBefore: true } };
    const removed = { ...comment, reaction: { count: 2, likedByMe: false, chargedBefore: true } };
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ comment: removed }))
      .mockResolvedValueOnce(response(discussion([removed], 25)))
      .mockResolvedValueOnce(response({ comment: liked }))
      .mockResolvedValueOnce(response(discussion([liked], 25)));
    renderDiscussion(fetchMock, policy, [liked]);
    fireEvent.click(screen.getByRole("button", { name: "Remove like from Alice’s comment. 3 likes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes" })).toBeEnabled());
    expect(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes" })).toHaveAttribute("title", "Like");
    fireEvent.click(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove like from Alice’s comment. 3 likes" })).toBeEnabled());
    const [first, second] = posts(fetchMock).map(([, init]) => JSON.parse(init.body));
    expect(first.liked).toBe(false);
    expect(second.liked).toBe(true);
    expect(second.requestKey).not.toBe(first.requestKey);
    expect(screen.getByText("25 Zcred available")).toBeInTheDocument();
  });

  it("does not present a stale balance as current after a confirmed action and a failed refresh", async () => {
    const saved = { ...comment, id: "new-comment", body: "A thoughtful proposal response." };
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ comment: saved }))
      .mockRejectedValueOnce(new Error("Refresh interrupted"))
      .mockResolvedValueOnce(response(discussion([comment, saved], 24)));
    renderDiscussion(fetchMock);
    draft();
    fireEvent.click(screen.getByRole("button", { name: "Publish · 1 Zcred" }));
    await screen.findByText("Balance unavailable");
    expect(screen.queryByText("25 Zcred available")).not.toBeInTheDocument();
    expect(screen.getByText(saved.body)).toBeInTheDocument();
    draft("A second draft.");
    expect(screen.getByRole("button", { name: "Publish · 1 Zcred" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh discussion" }));
    await screen.findByText("24 Zcred available");
    expect(screen.getByRole("textbox")).toHaveValue("A second draft.");
    expect(screen.getByRole("button", { name: "Publish · 1 Zcred" })).toBeEnabled();
  });

  it("keeps archived discussions read only and hides reactions on moderated comments", () => {
    const hidden = { ...comment, id: "hidden", hidden: true, body: null };
    renderDiscussion(vi.fn(), { ...policy, readOnly: true }, [comment, hidden]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Like Alice/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Like Alice/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Reply/ })).not.toBeInTheDocument();
  });
});


describe("Payment review in discussion", () => {
  it.each(["comment", "like"] as const)("pauses immediately after a rejected %s and keeps its retry key through an unavailable refresh", async action => {
    let rejectRefresh!: (reason: Error) => void;
    const clearedPolicy = { ...policy, participation: { ...policy.participation!, paymentReview: false } };
    const saved = action === "comment"
      ? { ...comment, id: "new-reply", parentId: comment.id, body: "Keep my reply and retry request." }
      : { ...comment, reaction: { count: 3, likedByMe: true, chargedBefore: true } };
    const nextComments = action === "comment" ? [comment, saved] : [saved];
    const fetchMock = vi.fn().mockResolvedValueOnce(response({ error: "CREDIT_PAYMENT_REVIEW" }, false))
      .mockImplementationOnce(() => new Promise((_, reject) => { rejectRefresh = reject; }))
      .mockResolvedValueOnce(response(discussion([comment], 25)))
      .mockResolvedValueOnce(response(discussion([comment], 25, clearedPolicy)))
      .mockResolvedValueOnce(response({ comment: saved }))
      .mockResolvedValueOnce(response(discussion(nextComments, 24, clearedPolicy)));
    renderDiscussion(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Reply to Alice" }));
    draft("Keep my reply and retry request.");
    const submitAction = () => fireEvent.click(screen.getByRole("button", {
      name: action === "comment" ? "Publish reply · 1 Zcred" : "Like Alice’s comment. 2 likes. 1 Zcred"
    }));
    submitAction();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText("A payment needs review. Credit spending is paused.").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^(Publishing…|Publish reply · 1 Zcred)$/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Like Alice/ })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Reply to Alice" })).toHaveValue("Keep my reply and retry request.");

    await act(async () => rejectRefresh(new Error("Account refresh unavailable")));
    await screen.findByText("Balance unavailable");
    expect(screen.getByRole("button", { name: "Publish reply · 1 Zcred" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Like Alice/ })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(posts(fetchMock)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Refresh discussion" }));
    await screen.findByText("25 Zcred available");
    expect(screen.getByRole("button", { name: "Publish reply · 1 Zcred" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Like Alice/ })).toBeDisabled();
    expect(posts(fetchMock)).toHaveLength(1);
    await act(async () => window.dispatchEvent(new CustomEvent("dao:credits-updated", { detail: { communityId: "community-a" } })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Publish reply · 1 Zcred" })).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Reply to Alice" })).toHaveValue("Keep my reply and retry request.");
    submitAction();
    await screen.findByText("24 Zcred available");
    const [first, second] = posts(fetchMock).map(([, init]) => JSON.parse(init.body));
    expect(second).toEqual(first);
    expect(second.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.policyVersion).toBe(1);
    if (action === "like") expect(screen.getByRole("textbox", { name: "Reply to Alice" })).toHaveValue("Keep my reply and retry request.");
  });

  it("blocks credit-consuming actions while preserving the comment draft", () => {
    const fetchMock = vi.fn();
    renderDiscussion(fetchMock, { ...policy, participation: { ...policy.participation!, paymentReview: true } });
    draft("Keep this draft while my payment is reviewed.");
    expect(screen.getByRole("alert")).toHaveTextContent("Credit spending is paused");
    expect(screen.getByRole("button", { name: "Publish · 1 Zcred" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Like Alice’s comment. 2 likes. 1 Zcred" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("textbox").closest("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Keep this draft while my payment is reviewed.");
  });
  it("still permits removing an already paid like", () => {
    renderDiscussion(vi.fn(), { ...policy, participation: { ...policy.participation!, paymentReview: true } }, [
      { ...comment, reaction: { count: 3, likedByMe: true, chargedBefore: true } }
    ]);
    expect(screen.getByRole("button", { name: "Remove like from Alice’s comment. 3 likes" })).toBeEnabled();
  });
});

it("edits its own version, sends the version with likes and preserves the new draft after a lost reply", async () => {
  const own = { ...comment, version: 1, canEdit: true, canWithdraw: true };
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(response({ comment: { ...own, body: "An updated view", version: 2, reaction: { count: 0, likedByMe: false, chargedBefore: false } } }));
  renderDiscussion(fetchMock, { ...policy, versioned: true }, [own]);
  fireEvent.click(screen.getByRole("button", { name: "Comment actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Edit comment" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit comment" }), { target: { value: "An updated view" } });
  fireEvent.click(screen.getByRole("button", { name: "Save edit" }));
  await screen.findByText(/Connection interrupted. Your draft is here/);
  expect(screen.getByRole("textbox", { name: "Edit comment" })).toHaveValue("An updated view");
  fireEvent.click(screen.getByRole("button", { name: "Save edit" }));
  await screen.findByText("An updated view");
  const calls = posts(fetchMock);
  expect(calls[0][1].body).toBe(calls[1][1].body);
  expect(JSON.parse(calls[0][1].body)).toMatchObject({ version: 1, body: "An updated view" });
  expect(screen.getByRole("button", { name: /Edited · v2 · View history/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Like Alice’s comment. 0 likes. 1 Zcred" }));
  await waitFor(() => expect(posts(fetchMock)).toHaveLength(3));
  expect(JSON.parse(posts(fetchMock)[2][1].body).version).toBe(2);
});

it("withdraws with an explicit inline explanation and keeps reply text and version history accessible", async () => {
  const own = { ...comment, version: 1, canEdit: true, canWithdraw: true };
  const reply = { ...comment, id: "reply", parentId: own.id, authorLabel: "Bob", body: "Reply remains" };
  const fetchMock = vi.fn().mockResolvedValueOnce(response({ comment: { ...own, body: null, withdrawn: true, canEdit: false, canWithdraw: false } }))
    .mockResolvedValueOnce(response({ versions: [{ version: 1, body: own.body, createdAt: own.createdAt, likes: 2 }] }));
  renderDiscussion(fetchMock, { ...policy, versioned: true }, [own, reply]);
  fireEvent.click(screen.getByRole("button", { name: "Comment actions" }));
  fireEvent.click(screen.getByRole("button", { name: "Withdraw comment" }));
  expect(screen.getByText(/Existing blockchain proofs cannot be erased/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Withdraw comment" }));
  await screen.findByText("Comment withdrawn by author");
  expect(screen.getByText("Reply remains")).toBeVisible();
  expect(screen.queryByText(own.body!)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "View history" }));
  await screen.findByText(own.body!);
  expect(screen.getByText("Version 1 · Withdrawn")).toBeVisible();
  expect(screen.queryByText("Version 1 · Current")).not.toBeInTheDocument();
});
