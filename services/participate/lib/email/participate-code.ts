import { EMAIL_CODE_TTL_SECONDS, type EmailPurpose } from "@/lib/auth/email-policy";
import { escapeHtml } from "@/lib/email/content";

export const OPENZCASH_SUPPORT_EMAIL = "support@openzcash.org";

const messages: Record<EmailPurpose, { subject: string; title: string; action: string; instruction: string }> = {
  SIGN_IN: {
    subject: "Your sign-in code · OpenZcash",
    title: "Your voice starts here.",
    action: "sign in to Participate",
    instruction: "Enter this code in the Participate window where you requested it."
  },
  PASSKEY_ADD: {
    subject: "Confirm your new passkey · OpenZcash",
    title: "Add your passkey.",
    action: "add a passkey to your OpenZcash account",
    instruction: "Enter this code in your profile to confirm your new passkey."
  },
  PASSKEY_REMOVE: {
    subject: "Confirm passkey removal · OpenZcash",
    title: "Confirm this change.",
    action: "remove a passkey from your OpenZcash account",
    instruction: "Enter this code in your profile to confirm passkey removal."
  }
};

/** No recipient, browser token or account data is included in the email markup. */
export function buildParticipateCodeEmail(code: string, purpose: EmailPurpose) {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid email code format");
  const message = messages[purpose];
  const minutes = EMAIL_CODE_TTL_SECONDS / 60;
  const preheader = `Your one-time code to ${message.action}. Valid for ${minutes} minutes.`;
  const text = [
    "OpenZcash · Participate",
    "",
    `Your code to ${message.action}: ${code}`,
    "",
    message.instruction,
    `It expires in ${minutes} minutes and works only in the browser that requested it.`,
    "",
    "Never share this code. OpenZcash will never ask you to send it by email or chat.",
    "If you did not request this code, you can safely ignore this email.",
    "",
    `Need help? ${OPENZCASH_SUPPORT_EMAIL}`,
    "https://openzcash.org"
  ].join("\n");

  // Tables and inline styles are intentional: the code stays readable when an
  // email client strips style blocks, blocks images or does not load web fonts.
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(message.subject)}</title>
  <style>
    @media (max-width: 480px) {
      .email-outer { padding: 20px 12px !important; }
      .email-inset { padding-left: 24px !important; padding-right: 24px !important; }
      .email-title { font-size: 28px !important; }
      .email-code { font-size: 36px !important; letter-spacing: 6px !important; }
    }
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: #12130f !important; }
      .email-card { background-color: #20211b !important; border-color: #3c3f32 !important; }
      .email-text { color: #f7f5ee !important; }
      .email-muted { color: #c0c1b7 !important; }
      .email-rule { border-color: #3c3f32 !important; }
      .email-code-panel { background-color: #302b1d !important; border-color: #746035 !important; }
      .email-gold { color: #f1c75b !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:#faf8f4;color:#1c1917;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;color:#faf8f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr><td class="email-outer" align="center" style="padding:40px 20px;">
      <!--[if mso]><table role="presentation" width="560" align="center"><tr><td><![endif]-->
      <table role="presentation" class="email-card" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e9e3d6;border-radius:20px;overflow:hidden;">
        <tr><td height="4" bgcolor="#f5b923" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td class="email-inset" style="padding:28px 40px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td width="54" valign="middle"><img src="https://openzcash.org/logos/marks/openzcash.png" width="48" height="48" alt="Zcash" style="display:block;width:48px;height:48px;border:0;" /></td>
              <td valign="middle" class="email-text" style="color:#1c1917;font-size:22px;line-height:28px;font-weight:750;letter-spacing:-0.6px;">OpenZcash</td>
              <td align="right" valign="middle" class="email-muted" style="color:#57534e;font-size:12px;line-height:18px;">Participate</td>
            </tr>
          </table>
        </td></tr>
        <tr><td class="email-inset" style="padding:12px 40px 32px;">
          <p class="email-gold" style="margin:0 0 12px;color:#92600f;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Account confirmation</p>
          <h1 class="email-title email-text" style="margin:0 0 14px;color:#1c1917;font-size:34px;line-height:1.16;letter-spacing:-1px;font-weight:750;">${escapeHtml(message.title)}</h1>
          <p class="email-muted" style="margin:0;color:#57534e;font-size:16px;line-height:25px;">${escapeHtml(message.instruction)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
            <tr><td align="center" class="email-code-panel" style="padding:24px 12px;background-color:#faf1de;border:1px solid #e9d5a6;border-radius:12px;">
              <p class="email-gold" style="margin:0 0 10px;color:#92600f;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Your verification code</p>
              <p class="email-code email-text" dir="ltr" style="margin:0;color:#1c1917;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:42px;font-weight:700;line-height:52px;letter-spacing:8px;white-space:nowrap;">${code}</p>
              <p class="email-muted" style="margin:10px 0 0;color:#57534e;font-size:13px;line-height:20px;">Valid for ${minutes} minutes · One use only</p>
            </td></tr>
          </table>
          <p class="email-muted" style="margin:20px 0 0;color:#57534e;font-size:13px;line-height:21px;">Use the same browser where you requested this code.</p>
        </td></tr>
        <tr><td class="email-inset email-rule" style="padding:22px 40px 28px;border-top:1px solid #e9e3d6;">
          <p class="email-text" style="margin:0 0 6px;color:#1c1917;font-size:13px;line-height:21px;font-weight:600;">Keep your code private.</p>
          <p class="email-muted" style="margin:0;color:#57534e;font-size:13px;line-height:21px;">OpenZcash will never ask you to send it by email or chat. If you didn’t request this, simply ignore this email.</p>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;">
        <tr><td align="center" style="padding:22px 12px 0;">
          <p class="email-muted" style="margin:0 0 6px;color:#57534e;font-size:12px;line-height:20px;">Need a hand? <a class="email-gold" href="mailto:${OPENZCASH_SUPPORT_EMAIL}" style="color:#92600f;text-decoration:underline;">${OPENZCASH_SUPPORT_EMAIL}</a></p>
          <p style="margin:0;font-size:12px;line-height:20px;"><a class="email-muted" href="https://openzcash.org" style="color:#57534e;text-decoration:none;">openzcash.org</a></p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: message.subject, html, text };
}
