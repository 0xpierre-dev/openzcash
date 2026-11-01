import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth/session";
import { readAccountProfileForm } from "@/lib/http/account-profile-form";
import { rejectIfUntrustedWriteOrigin } from "@/lib/http/write-origin";
import { AccountProfileError, readAccountProfile, updateAccountProfile } from "@/lib/services/account-profile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function privateResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

function errorResponse(error: unknown) {
  if (error instanceof AccountProfileError) {
    return privateResponse(NextResponse.json({ error: error.code, message: error.message }, { status: error.status }));
  }
  return privateResponse(NextResponse.json({ error: "ACCOUNT_SETTINGS_FAILED" }, { status: 500 }));
}

export async function GET() {
  try {
    const session = await readSession();
    if (!session) return privateResponse(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    if (session.subjectType !== "user") return privateResponse(NextResponse.json({ error: "ACCOUNT_SETTINGS_UNAVAILABLE" }, { status: 403 }));
    return privateResponse(NextResponse.json({ profile: await readAccountProfile(session.userId) }));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const rejected = rejectIfUntrustedWriteOrigin(request);
  if (rejected) return privateResponse(rejected);
  try {
    const session = await readSession();
    if (!session) return privateResponse(NextResponse.json({ error: "unauthorized" }, { status: 401 }));
    if (session.subjectType !== "user") return privateResponse(NextResponse.json({ error: "ACCOUNT_SETTINGS_UNAVAILABLE" }, { status: 403 }));
    const input = await readAccountProfileForm(request);
    return privateResponse(NextResponse.json({ profile: await updateAccountProfile(session.userId, input) }));
  } catch (error) {
    return errorResponse(error);
  }
}
