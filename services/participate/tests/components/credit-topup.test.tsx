import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CreditTopUp } from "@/components/credit-topup";
import type { CreditPurchaseView, CreditPurchasesView } from "@/lib/domain/credit-purchases";

const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }));
vi.mock("qrcode", () => ({ default: qr }));
const qrImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const receiver = "u1-test-only-dao-receiver";
const memo = "credit-invoice:unit-test-001";
const uri = (address = receiver, amount = "0.00100001", paymentMemo = memo) =>
  `zcash:${address}?amount=${amount}&memo=${Buffer.from(paymentMemo).toString("base64url")}`;
const pending: CreditPurchaseView = {
  id: "invoice-a", communityId: "community-a", network: "mainnet", credits: 100,
  amountZat: "100001", amountZec: "0.00100001", address: receiver, memo, paymentUri: uri(),
  status: "PENDING", confirmations: 0, requiredConfirmations: 3,
  expiresAt: "2035-01-01T00:30:00Z", createdAt: "2026-10-09T12:00:00Z", txid: null
};
const funding: CreditPurchasesView["funding"] = {
  configured: true, network: "mainnet", package: { credits: 100, amountZat: "100001", amountZec: "0.00100001" }
};
const response = (value: unknown, ok = true) => ({ ok, json: async () => value });
const view = (purchases: CreditPurchaseView[] = [], nextFunding = funding): CreditPurchasesView => ({ funding: nextFunding, purchases });
const credited = (overrides: Partial<CreditPurchaseView> = {}): CreditPurchaseView => ({ ...pending, status: "CREDITED", confirmations: 3, txid: "a".repeat(64), paymentUri: null, ...overrides });

async function setup(fetchMock = vi.fn().mockResolvedValue(response(view())), communityId = "community-a") {
  vi.stubGlobal("fetch", fetchMock);
  const onCreditsChanged = vi.fn();
  const rendered = render(<CreditTopUp communityId={communityId} onCreditsChanged={onCreditsChanged} />);
  await waitFor(() => expect(screen.queryByText("Loading payment requests…")).not.toBeInTheDocument());
  return { ...rendered, fetchMock, onCreditsChanged };
}

function purchasePosts(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
}

beforeEach(() => { qr.toDataURL.mockReset(); qr.toDataURL.mockResolvedValue(qrImage); });
afterEach(() => {
  vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
  if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
  else Reflect.deleteProperty(navigator, "clipboard");
});

describe("DAO wallet credit top-ups", () => {
  it("identifies the pilot operator without offering payment while the wallet is being prepared", async () => {
    await setup(vi.fn().mockResolvedValue(response(view([], { configured: false, network: null, package: null, preparedReceiver: { operator: "OpenZcash pilot", network: "mainnet", state: "preparing" } }))));
    fireEvent.click(screen.getByText("Add credits", { exact: false }));
    expect(screen.getByText(/Recipient: OpenZcash pilot/)).toBeVisible();
    expect(screen.getByText("1 Zcred = $0.25")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create invoice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(qr.toDataURL).not.toHaveBeenCalled();
  });
  it("does not offer invoices or a wallet link before this DAO has a receiver", async () => {
    const { fetchMock } = await setup(vi.fn().mockResolvedValue(response(view([], { configured: false, network: null, package: null }))));
    const explanation = screen.getByText("This DAO has not connected its receiving wallet yet.");
    expect(explanation).not.toBeVisible();
    fireEvent.click(screen.getByText("Add credits", { exact: false }));
    expect(explanation).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create invoice" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(qr.toDataURL).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("/api/account/credits/purchases?communityId=community-a", expect.objectContaining({ cache: "no-store" }));
  });

  it("keeps an existing payment visible even when new top-ups are unavailable", async () => {
    const confirming = { ...pending, status: "CONFIRMING" as const, confirmations: 1, txid: "a".repeat(64), paymentUri: null };
    await setup(vi.fn().mockResolvedValue(response(view([confirming], { configured: false, network: null, package: null }))));
    expect(screen.getByRole("region", { name: "Payment request" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Check payment" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Create invoice" })).not.toBeInTheDocument();
  });

  it("recovers an uncertain invoice creation with the same key and no client-controlled price", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view()))
      .mockRejectedValueOnce(new Error("Connection lost"))
      .mockResolvedValueOnce(response({ purchase: pending }));
    const { onCreditsChanged } = await setup(fetchMock);
    expect(screen.getByText("100 Zcred")).toBeInTheDocument();
    expect(screen.getByText(/0.00100001 ZEC/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Retry to recover the same invoice");
    fireEvent.click(screen.getByRole("button", { name: "Retry invoice" }));
    await screen.findByRole("link", { name: "Open wallet" });
    const [first, second] = purchasePosts(fetchMock).map(([, init]) => JSON.parse(init.body));
    expect(second).toEqual(first);
    expect(Object.keys(first).sort()).toEqual(["communityId", "requestKey"]);
    expect(first.communityId).toBe("community-a");
    expect(first.requestKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(onCreditsChanged).not.toHaveBeenCalled();
    expect(screen.queryByText("Credits added")).not.toBeInTheDocument();
  });

  it("blocks duplicate creates while the invoice response is pending", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view()))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await setup(fetchMock);
    const create = screen.getByRole("button", { name: "Create invoice" });
    fireEvent.click(create); fireEvent.click(create);
    expect(purchasePosts(fetchMock)).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Creating invoice…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh invoices" })).toBeDisabled();
    await act(async () => finish(response({ purchase: pending })));
  });

  it("uses the same exact invoice URI for the wallet link and locally generated QR", async () => {
    await setup(vi.fn().mockResolvedValue(response(view([pending]))));
    expect(screen.getByRole("link", { name: "Open wallet" })).toHaveAttribute("href", pending.paymentUri);
    expect(qr.toDataURL).toHaveBeenCalledWith(pending.paymentUri);
    const image = await screen.findByRole("img", { name: "QR code for this Zcash payment request" });
    expect(image).toHaveAttribute("src", qrImage);
    expect(screen.getByLabelText("Receiving address")).toHaveValue(receiver);
    expect(screen.getByLabelText("Payment memo")).toHaveValue(memo);
    expect(screen.getByText("Mainnet")).toBeInTheDocument();
    expect(screen.getByText(/Pay before/)).toHaveTextContent("Jan 1");
  });

  it.each([
    ["a different receiver", uri("u1-other-test-only-receiver")],
    ["a different amount", uri(receiver, "0.00200001")],
    ["a different memo", uri(receiver, "0.00100001", "another-invoice")],
    ["duplicate amounts", `${uri()}&amount=1`],
    ["duplicate memos", `${uri()}&memo=b3RoZXI`],
    ["an extra recipient", `${uri()}&address.1=u1-other`],
    ["an unknown required parameter", `${uri()}&req-extra=1`],
    ["an unsafe scheme", "javascript:alert(1)"]
  ])("withholds wallet and QR access for %s", async (_reason, paymentUri) => {
    await setup(vi.fn().mockResolvedValue(response(view([{ ...pending, paymentUri }]))));
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(qr.toDataURL).not.toHaveBeenCalled();
    expect(screen.getByText(/This invoice is not currently payable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check payment" })).toBeEnabled();
  });

  it("keeps wallet and manual payment details usable if QR generation fails", async () => {
    qr.toDataURL.mockRejectedValueOnce(new Error("QR unavailable"));
    await setup(vi.fn().mockResolvedValue(response(view([pending]))));
    await screen.findByText("QR unavailable. Open your wallet or use the payment details below.");
    expect(screen.getByRole("link", { name: "Open wallet" })).toBeInTheDocument();
    expect(screen.getByLabelText("Payment memo")).toHaveValue(memo);
  });

  it("ignores a delayed QR from the previously selected invoice", async () => {
    let finish!: (value: string) => void;
    qr.toDataURL.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
    const older = credited({ id: "invoice-old", credits: 250, createdAt: "2026-10-08T12:00:00Z" });
    await setup(vi.fn().mockResolvedValue(response(view([pending, older]))));
    fireEvent.click(screen.getByText(/Recent invoices/));
    fireEvent.click(screen.getByRole("button", { name: /250 Zcred.*Credits added/ }));
    await act(async () => finish(qrImage));
    expect(screen.queryByRole("img", { name: "QR code for this Zcash payment request" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
  });

  it("separates payment detection from final confirmation and refreshes credits only after CREDITED", async () => {
    const confirming = { ...pending, status: "CONFIRMING" as const, confirmations: 1, txid: "a".repeat(64), paymentUri: null };
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view([pending])))
      .mockResolvedValueOnce(response({ purchase: confirming }))
      .mockResolvedValueOnce(response({ purchase: credited() }));
    const { onCreditsChanged } = await setup(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Check payment" }));
    await screen.findByText("1 / 3 confirmations");
    expect(onCreditsChanged).not.toHaveBeenCalled();
    expect(screen.queryByText("Credits added")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code for this Zcash payment request" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Check payment" }));
    await screen.findByText("Credits added");
    expect(onCreditsChanged).toHaveBeenCalledOnce();
    expect(screen.getByText("3 / 3 confirmations")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Invoice details"));
    expect(screen.getByLabelText("Transaction ID")).toHaveValue("a".repeat(64));
    expect(purchasePosts(fetchMock).map(([url, init]) => [url, JSON.parse(init.body)])).toEqual([
      ["/api/account/credits/purchases/invoice-a/check", {}], ["/api/account/credits/purchases/invoice-a/check", {}]
    ]);
  });

  it("refreshes the account when a credited payment moves to review, without claiming another credit", async () => {
    const review = { ...credited(), status: "REVIEW" as const, confirmations: 0 };
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view([credited()])))
      .mockResolvedValueOnce(response({ purchase: review }));
    const { onCreditsChanged } = await setup(fetchMock);
    expect(onCreditsChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Check payment" }));
    await screen.findByText("Needs review");
    expect(onCreditsChanged).toHaveBeenCalledOnce();
    expect(screen.queryByText("Credits added")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment confirmed. Your credits have been added.")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("This payment needs administrator review.");
    expect(screen.getByText("This payment needs administrator review. Share the invoice and transaction IDs below.")).toBeInTheDocument();
    expect(screen.queryByText(/before credits can be added/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
  });

  it("shows payment evidence on an expired invoice while waiting for confirmation, without asking for another payment", async () => {
    const expired: CreditPurchaseView = { ...pending, status: "EXPIRED", paymentUri: null };
    const detected = { ...expired, txid: "a".repeat(64), confirmations: 1 };
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view([expired])))
      .mockResolvedValueOnce(response({ purchase: detected }))
      .mockResolvedValueOnce(response({ purchase: credited() }));
    const { onCreditsChanged } = await setup(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Check payment" }));
    await screen.findByText("1 / 3 confirmations");
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Payment detected. The payment window has closed; check again while it confirms. Do not send again.");
    expect(screen.getAllByText(/Payment detected\. The payment window has closed/)).toHaveLength(2);
    expect(screen.queryByText(/No credits have been confirmed for it/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code for this Zcash payment request" })).not.toBeInTheDocument();
    expect(onCreditsChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Check payment" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Check payment" }));
    await screen.findByText("3 / 3 confirmations");
    expect(screen.getByText("Credits added")).toBeInTheDocument();
    expect(onCreditsChanged).toHaveBeenCalledOnce();
  });

  it("does not infer confirmation from an interrupted payment check", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view([pending])))
      .mockRejectedValueOnce(new Error("Wallet unavailable"));
    const { onCreditsChanged } = await setup(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Check payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Payment confirmation is unavailable");
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();
    expect(onCreditsChanged).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Check payment" })).toBeEnabled();
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code for this Zcash payment request" })).not.toBeInTheDocument();
    expect(screen.getByText("Payment status is unavailable. Check again before sending a payment.")).toBeInTheDocument();
  });

  it("keeps failed refreshes recoverable and withholds stale wallet and QR links", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view([pending])))
      .mockRejectedValueOnce(new Error("Disconnected"))
      .mockResolvedValueOnce(response(view([pending])));
    await setup(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Refresh invoices" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Previous details may be out of date");
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code for this Zcash payment request" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh invoices" }));
    await screen.findByRole("link", { name: "Open wallet" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("expires the payment controls locally without polling or launching a wallet", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2035-01-01T00:00:00Z"));
    const expiring = { ...pending, expiresAt: "2035-01-01T00:00:01Z" };
    const fetchMock = vi.fn().mockResolvedValue(response(view([expiring])));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<CreditTopUp communityId="community-a" onCreditsChanged={vi.fn()} />); });
    expect(screen.getByRole("link", { name: "Open wallet" })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(1100));
    expect(screen.queryByRole("link", { name: "Open wallet" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "QR code for this Zcash payment request" })).not.toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create invoice" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Check payment" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("copies exact invoice data and offers manual selection after clipboard failure", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Not allowed"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await setup(vi.fn().mockResolvedValue(response(view([pending]))));
    fireEvent.click(screen.getByRole("button", { name: "Copy address" }));
    await screen.findByText("Copied.");
    expect(writeText).toHaveBeenNthCalledWith(1, receiver);
    fireEvent.click(screen.getByRole("button", { name: "Copy memo" }));
    await screen.findByText("Select and copy this value manually.");
    expect(writeText).toHaveBeenNthCalledWith(2, memo);
    const field = screen.getByLabelText("Payment memo") as HTMLTextAreaElement;
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(memo.length);
  });

  it("selects an active invoice first and keeps a selected historical invoice through refresh", async () => {
    const newer = credited({ id: "newer-credited", credits: 250, createdAt: "2026-10-10T12:00:00Z" });
    const fetchMock = vi.fn().mockResolvedValue(response(view([newer, pending])));
    await setup(fetchMock);
    expect(within(screen.getByRole("region", { name: "Payment request" })).getByText("Awaiting payment")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Recent invoices/));
    fireEvent.click(screen.getByRole("button", { name: /250 Zcred.*Credits added/ }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh invoices" }));
    await waitFor(() => expect(screen.queryByText("Loading payment requests…")).not.toBeInTheDocument());
    expect(within(screen.getByRole("region", { name: "Payment request" })).getByText("Credits added")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View active invoice" })).toBeInTheDocument();
  });

  it("requires refreshing an existing pending invoice instead of creating another one", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view()))
      .mockResolvedValueOnce(response({ error: "CREDIT_PURCHASE_PENDING" }, false))
      .mockResolvedValueOnce(response(view([pending])));
    await setup(fetchMock);
    fireEvent.click(screen.getByRole("button", { name: "Create invoice" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Refresh invoices to view it");
    expect(screen.getByRole("button", { name: "Create invoice" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh invoices" }));
    await screen.findByRole("link", { name: "Open wallet" });
    expect(purchasePosts(fetchMock)).toHaveLength(1);
  });

  it("rejects malformed credit confirmation data rather than presenting a completion", async () => {
    const { onCreditsChanged } = await setup(vi.fn().mockResolvedValue(response(view([credited({ confirmations: 0, txid: null })]))));
    expect(screen.getByRole("alert")).toHaveTextContent("Payment requests could not be loaded");
    expect(screen.queryByText("Credits added")).not.toBeInTheDocument();
    expect(onCreditsChanged).not.toHaveBeenCalled();
  });

  it("loads correctly under StrictMode and resets invoice state when switching DAOs", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(view([pending])))
      .mockResolvedValueOnce(response(view([], { configured: false, network: null, package: null })));
    vi.stubGlobal("fetch", fetchMock);
    const callback = vi.fn();
    const rendered = render(<StrictMode><CreditTopUp communityId="community-a" onCreditsChanged={callback} /></StrictMode>);
    await screen.findByRole("link", { name: "Open wallet" });
    rendered.rerender(<StrictMode><CreditTopUp communityId="community-b" onCreditsChanged={callback} /></StrictMode>);
    expect(screen.queryByText("Awaiting payment")).not.toBeInTheDocument();
    await screen.findByText("This DAO has not connected its receiving wallet yet.");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/account/credits/purchases?communityId=community-b", expect.objectContaining({ cache: "no-store" }));
  });
});
