import { emailDeliveryAvailable } from "@/lib/services/email-delivery";
import { demoSignInAvailable } from "@/lib/services/email-auth";
import { emailResponse } from "@/lib/http/email-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return emailResponse({ emailAvailable: emailDeliveryAvailable(), demoAvailable: demoSignInAvailable() });
}
