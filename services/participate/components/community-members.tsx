"use client";

import Link from "next/link";
import { useState } from "react";
import { WorkspaceFrame, type WorkspaceFrameProps } from "@/components/community-workspace";
import { AccountRosterSetup, MembershipRequestList } from "@/components/membership-access";
import type { MembershipRequestView } from "@/lib/services/account-membership";

export type WorkspaceMember = {
  id: string;
  nick: string;
  signalUsername: string | null;
  userId?: string | null;
  status: "ACTIVE" | "REMOVED";
  addedByPollId: string | null;
  removedByPollId: string | null;
};

type CommunityMembersProps = Omit<WorkspaceFrameProps, "children" | "activeSection"> & {
  members: WorkspaceMember[];
  requests?: MembershipRequestView[];
};

const FILTERS = ["All", "Active", "Removed"] as const;

export function CommunityMembers({ community, communities, viewer, isDemo, members, requests = [] }: CommunityMembersProps) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("en-US");
  const counts = {
    All: members.length,
    Active: members.filter(member => member.status === "ACTIVE").length,
    Removed: members.filter(member => member.status === "REMOVED").length
  };
  const visibleMembers = members.filter(member => (
    (filter === "All" || member.status === filter.toUpperCase())
    && `${member.nick} ${member.signalUsername ?? ""}`.toLocaleLowerCase("en-US").includes(query)
  ));
  const base = `/communities/${encodeURIComponent(community.id)}`;
  const canManage = viewer?.role === "OWNER" || viewer?.role === "MANAGER";

  return (
    <WorkspaceFrame community={community} communities={communities} viewer={viewer} isDemo={isDemo} activeSection="members">
      <section aria-labelledby="dao-members-heading" className="dao-members">
        <div className="dao-section-heading dao-members-heading">
          <div>
            <h1 id="dao-members-heading">Members</h1>
            <p>Account-based membership. Community-approved changes.</p>
          </div>
          {members.length > 0 && canManage ? (
            <Link className="dao-button dao-button--primary" href={`${base}/members/change`}>
              <span aria-hidden="true">+</span> Propose change
            </Link>
          ) : null}
        </div>

        {canManage && requests.length > 0 ? <MembershipRequestList communityId={community.id} requests={requests} /> : null}
        {members.length === 0 ? (
          <div className="dao-members-setup">
            {viewer?.role === "OWNER" ? <AccountRosterSetup key={community.id} communityId={community.id} nick={viewer.nick} requests={requests} /> : <p>The owner can set up the first voting roster.</p>}
          </div>
        ) : (
          <>
            <div className="dao-proposal-tools dao-member-tools">
              <div className="dao-filter-list" aria-label="Filter members">
                {FILTERS.map(item => (
                  <button key={item} type="button" aria-pressed={filter === item} className={`dao-filter${filter === item ? " dao-filter--active" : ""}`} onClick={() => setFilter(item)}>
                    {item}<span>{counts[item]}</span>
                  </button>
                ))}
              </div>
              <label className="dao-search">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
                <span className="dao-sr-only">Search members</span>
                <input type="search" placeholder="Search members" value={search} onChange={event => setSearch(event.target.value)} />
              </label>
            </div>
            <p className="dao-sr-only" role="status">{visibleMembers.length} {visibleMembers.length === 1 ? "member" : "members"} shown</p>
            {visibleMembers.length > 0 ? (
              <div className="dao-member-list">
                <table className="dao-member-table">
                  <caption className="dao-sr-only">{community.name} member list</caption>
                  <thead><tr><th scope="col">Member</th><th scope="col">Access</th><th scope="col">Status</th><th scope="col">Membership source</th></tr></thead>
                  <tbody>
                    {visibleMembers.map(member => {
                      const sourceId = member.removedByPollId ?? member.addedByPollId;
                      return (
                        <tr key={member.id}>
                          <th scope="row" className="dao-member-name"><span className="dao-member-identity"><span className="dao-member-avatar" aria-hidden="true">{Array.from(member.nick)[0]?.toLocaleUpperCase("en-US") ?? "M"}</span><span>{member.nick}</span></span></th>
                          <td className="dao-member-signal"><span className="dao-member-mobile-label" aria-hidden="true">Access</span>{member.userId ? <span className="dao-member-account-label">account</span> : <details className="dao-legacy-identity"><summary>Legacy invitation</summary><span>{member.signalUsername ?? "Unlinked identity"}</span></details>}</td>
                          <td className="dao-member-status"><span className={`dao-status${member.status === "ACTIVE" ? " dao-status--open" : ""}`}>{member.status === "ACTIVE" ? "Active" : "Removed"}</span></td>
                          <td className="dao-member-source">{sourceId ? (
                            <Link href={`${base}/proposals/${encodeURIComponent(sourceId)}`}>{member.removedByPollId ? "Removal proposal" : "Membership proposal"}<span aria-hidden="true"> ↗</span></Link>
                          ) : <span>Initial roster</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dao-members-empty"><p>No matching members.</p><span>Try another search or filter.</span></div>
            )}
            <p className="dao-members-note">Account members sign in to access new ballots. Existing invitation records keep their original access.</p>
          </>
        )}
        {canManage && requests.length === 0 ? <MembershipRequestList communityId={community.id} requests={requests} /> : null}
      </section>
    </WorkspaceFrame>
  );
}
