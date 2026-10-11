import { z } from "zod/v3";
import { committeeLabelIds } from "./committee-labels";
import type { ZcgProposalExample } from "@/lib/participate/workspace/data/zcg-proposal-examples";

export const committeeRole = z.enum(["MANAGER", "REVIEWER", "MODERATOR"]);
export type CommitteeRole = "OWNER" | z.infer<typeof committeeRole>;
export const committeeRoleLabels: Record<CommitteeRole, string> = { OWNER: "Owner", MANAGER: "Coordinator", REVIEWER: "Reviewer", MODERATOR: "Moderator" };
export const committeeRules = z.object({ quorum: z.number().int().min(1).max(200), approvalPercent: z.number().int().min(1).max(100), durationHours: z.number().int().min(1).max(720) }).strict();
export const publicReviewerName = z.string().trim().min(2).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Use a visible public name");
const email = z.string().trim().email().max(254).transform(value => value.toLowerCase());
export const committeeAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite"), email, role: committeeRole }).strict(),
  z.object({ action: z.literal("revoke-invite"), invitationId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("accept"), invitationId: z.string().uuid(), publicName: publicReviewerName, consent: z.literal(true) }).strict(),
  z.object({ action: z.literal("member"), memberId: z.string().min(1).max(128), version: z.number().int().positive(), role: committeeRole, status: z.enum(["ACTIVE", "DISABLED"]), reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal("policy"), version: z.number().int().min(0), rules: committeeRules }).strict(),
  z.object({ action: z.literal("labels"), recordId: z.string().min(1).max(128), version: z.number().int().min(0).max(2147483646), labels: committeeLabelIds }).strict()
]);
export const reviewerRoles: CommitteeRole[] = ["OWNER", "MANAGER", "REVIEWER"];
export function committeePermissions(role: CommitteeRole | null) {
  return { canManageTeam: role === "OWNER", canOpen: role === "OWNER" || role === "MANAGER", canModerate: role === "OWNER" || role === "MANAGER" || role === "MODERATOR", canReview: role !== null && reviewerRoles.includes(role) };
}
export type CommitteeWorkspace = {
  access: "RESTRICTED" | "SIGNED_OUT" | "DENIED" | "INVITED" | "MEMBER";
  name: string; role: CommitteeRole | null; demo: boolean; canMutate: boolean; emailReady: boolean;
  permissions: ReturnType<typeof committeePermissions>;
  rules: { quorum: 5; approvalPercent: 60; durationHours: null; version: number };
  members: { id: string; name: string; avatar: string | null; email: string | null; role: CommitteeRole; status: "ACTIVE" | "DISABLED"; version: number; ready: boolean; isMe: boolean; emailVerified: boolean; keyCount: number }[];
  invitations: { id: string; email: string; role: Exclude<CommitteeRole, "OWNER">; expiresAt: string; state: "PENDING" | "EXPIRED" | "ACCEPTED" | "REVOKED"; mine: boolean }[];
  queue: { recordId: string; hostId: string; title: string; revision: number; kind: string; state: string; roundId: string | null; closesAt: string | null; signed: number; eligible: number; myChoice: string | null; myPending: boolean; labels: string[]; labelsVersion: number; sourceDecision?: ZcgProposalExample | null }[];
  history: { id: string; sequence: number; action: string; actor: string; summary: string; createdAt: string; hash: string }[];
  historyBefore: number | null;
};
