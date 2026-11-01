import { cookies } from "next/headers";
import { COMMITTEE_ADMIN_TTL } from "./committee-admin";

const cookieName = () => process.env.NODE_ENV === "production" ? "__Host-participate-moderation" : "participate-moderation";
const options = () => ({ httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/" });
export async function readPilotModerationToken() { return (await cookies()).get(cookieName())?.value; }
export async function writePilotModerationToken(token: string) { (await cookies()).set(cookieName(), token, { ...options(), maxAge: COMMITTEE_ADMIN_TTL }); }
export async function clearPilotModerationToken() { (await cookies()).set(cookieName(), "", { ...options(), maxAge: 0 }); }
