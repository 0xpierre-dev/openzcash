// @vitest-environment node
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

import { deliverEmailCode } from "@/lib/services/email-delivery";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("RESEND_API_KEY", "test-only-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "OpenZcash <support@openzcash.org>");
  vi.stubEnv("EMAIL_AUTH_SECRET", "x".repeat(32));
  send.mockResolvedValue({ data: { id: "message-id" }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("sends the configured identity, reply address and both bodies without putting a code in the subject", async () => {
  await deliverEmailCode("member@example.test", "012345", "SIGN_IN", "challenge-id");
  expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    from: "OpenZcash <support@openzcash.org>",
    to: ["member@example.test"],
    replyTo: "support@openzcash.org",
    subject: "Your sign-in code · OpenZcash",
    html: expect.stringContaining("012345"),
    text: expect.stringContaining("012345")
  }), { idempotencyKey: "email-auth/challenge-id" });
  expect(send.mock.calls[0][0].html).not.toContain("member@example.test");
  expect(send.mock.calls[0][0].html).not.toContain("challenge-id");
});

it("fails closed when the sender is missing", async () => {
  vi.stubEnv("RESEND_FROM_EMAIL", "");
  await expect(deliverEmailCode("member@example.test", "012345", "SIGN_IN", "id"))
    .rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED", status: 503 });
  expect(send).not.toHaveBeenCalled();
});

it("does not call the provider with malformed content", async () => {
  await expect(deliverEmailCode("member@example.test", "<script>", "SIGN_IN", "id"))
    .rejects.toMatchObject({ code: "EMAIL_DELIVERY_FAILED", status: 503 });
  expect(send).not.toHaveBeenCalled();
});

it.each([
  { data: null, error: { message: "private provider diagnostics" } },
  { data: {}, error: null }
])("does not report success when the provider does not accept the message", async response => {
  send.mockResolvedValue(response);
  await expect(deliverEmailCode("member@example.test", "012345", "SIGN_IN", "id"))
    .rejects.toMatchObject({ code: "EMAIL_DELIVERY_FAILED", status: 503 });
});

it("redacts provider exceptions", async () => {
  send.mockRejectedValue(new Error("private provider diagnostics"));
  await expect(deliverEmailCode("member@example.test", "012345", "SIGN_IN", "id"))
    .rejects.toThrow("EMAIL_DELIVERY_FAILED");
});
