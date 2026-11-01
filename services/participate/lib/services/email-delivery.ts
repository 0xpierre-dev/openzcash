import { Resend } from "resend";
import { EmailAuthError, type EmailPurpose } from "@/lib/auth/email-policy";
import { buildParticipateCodeEmail, OPENZCASH_SUPPORT_EMAIL } from "@/lib/email/participate-code";

export function emailDeliveryAvailable() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim() &&
    (process.env.EMAIL_AUTH_SECRET?.length ?? 0) >= 32 &&
    (process.env.NODE_ENV !== "production" || (process.env.ZCAP_SESSION_SECRET?.length ?? 0) >= 32));
}

export async function deliverEmailCode(email: string, code: string, purpose: EmailPurpose, id: string) {
  if (!emailDeliveryAvailable()) throw new EmailAuthError("EMAIL_NOT_CONFIGURED", 503);
  try {
    const { data, error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.RESEND_FROM_EMAIL!.trim(), to: [email],
      replyTo: OPENZCASH_SUPPORT_EMAIL,
      ...buildParticipateCodeEmail(code, purpose)
    }, { idempotencyKey: `email-auth/${id}` });
    if (error || !data?.id) throw new Error("Delivery failed");
  } catch { throw new EmailAuthError("EMAIL_DELIVERY_FAILED", 503); }
}
