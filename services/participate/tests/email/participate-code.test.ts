import { buildParticipateCodeEmail } from "@/lib/email/participate-code";
import { EMAIL_CODE_TTL_SECONDS, type EmailPurpose } from "@/lib/auth/email-policy";

describe("Participate confirmation email", () => {
  it.each<[EmailPurpose, string]>([
    ["SIGN_IN", "sign in to Participate"],
    ["PASSKEY_ADD", "add a passkey"],
    ["PASSKEY_REMOVE", "remove a passkey"]
  ])("describes only the requested %s action in the branded HTML and text fallback", (purpose, action) => {
    const email = buildParticipateCodeEmail("012345", purpose);
    expect(email.subject).toContain("OpenZcash");
    expect(email.subject).not.toContain("012345");
    expect(email.html).toContain("OpenZcash");
    expect(email.html).toContain("012345");
    expect(email.html).toContain(action);
    expect(email.text).toContain(action);
    expect(email.text).toContain("012345");
    expect(email.text).toContain(`${EMAIL_CODE_TTL_SECONDS / 60} minutes`);
    expect(email.text).toContain("only in the browser that requested it");
    expect(email.html).toContain('href="mailto:support@openzcash.org"');
    expect(email.html).not.toMatch(/localhost|127\.0\.0\.1|[?&](token|code)=|<script|<form/i);
    expect(email.html.match(/012345/g)).toHaveLength(1);
  });

  it.each(["12345", "1234567", "123 456", "１２３４５６", "<img src=x onerror=alert(1)>", "123456\n"])("rejects malformed code %j before it can enter HTML or headers", code => {
    expect(() => buildParticipateCodeEmail(code, "SIGN_IN")).toThrow("Invalid email code format");
  });
});
