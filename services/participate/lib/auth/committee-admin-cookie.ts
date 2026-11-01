import { cookies } from "next/headers";
import { COMMITTEE_ADMIN_TTL } from "./committee-admin";

const cookieName = () => process.env.NODE_ENV === "production" ? "__Host-committee-preview" : "committee-preview";
const options = () => ({ httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/" });
export async function readCommitteePreviewToken() { return (await cookies()).get(cookieName())?.value; }
export async function writeCommitteePreviewToken(token: string) { (await cookies()).set(cookieName(), token, { ...options(), maxAge: COMMITTEE_ADMIN_TTL }); }
export async function clearCommitteePreviewToken() { (await cookies()).set(cookieName(), "", { ...options(), maxAge: 0 }); }
