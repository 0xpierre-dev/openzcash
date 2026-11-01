"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

export type SwitcherCommunity = { id: string; name: string; slug: string };

type WorkspaceCommunitySwitcherProps = {
  community: SwitcherCommunity;
  communities: SwitcherCommunity[];
  destination?: "proposals" | "members";
};

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => Array.from(word)[0]).join("").toLocaleUpperCase("en-US") || "C";
}

export function WorkspaceCommunitySwitcher({ community, communities, destination = "proposals" }: WorkspaceCommunitySwitcherProps) {
  const id = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("en-US");
  const visibleCommunities = communities.filter(item => `${item.name} ${item.slug}`.toLocaleLowerCase("en-US").includes(query));
  const dialogId = `${id}-dialog`;
  const headingId = `${id}-heading`;
  const searchId = `${id}-search`;

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) close(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close(true);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  function toggle() {
    if (open) {
      close(true);
      return;
    }
    setSearch("");
    setOpen(true);
  }

  return (
    <div
      className="dao-switcher"
      ref={wrapperRef}
      onBlur={event => {
        if (open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close(false);
      }}
    >
      <button
        type="button"
        className="dao-switcher-trigger"
        ref={triggerRef}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={toggle}
      >
        <span className="dao-switcher-avatar" aria-hidden="true">{initials(community.name)}</span>
        <span className="dao-switcher-trigger-copy">
          <span className="dao-switcher-label">Community / DAO</span>
          <span className="dao-switcher-name">{community.name}</span>
        </span>
        <svg className="dao-switcher-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8 9 4-4 4 4m-8 6 4 4 4-4" /></svg>
      </button>
      {open ? (
        <div className="dao-switcher-popover" id={dialogId} role="dialog" aria-labelledby={headingId}>
          <div className="dao-switcher-heading">
            <div><h2 id={headingId}>Choose a community / DAO</h2><p>Explore proposals and join the discussion.</p></div>
            <button type="button" className="dao-switcher-close" aria-label="Close community selector" onClick={() => close(true)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
            </button>
          </div>
          <div className="dao-switcher-search">
            <label className="dao-sr-only" htmlFor={searchId}>Search communities</label>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
            <input id={searchId} ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find your community" autoComplete="off" />
          </div>
          <p className="dao-switcher-count" role="status">
            {query ? `${visibleCommunities.length} of ${communities.length}` : communities.length} {communities.length === 1 ? "community available" : "communities available"}
          </p>
          {visibleCommunities.length > 0 ? (
            <ul className="dao-switcher-list">
              {visibleCommunities.map(item => {
                const current = item.id === community.id;
                return (
                  <li key={item.id}>
                    <Link href={`/communities/${encodeURIComponent(item.id)}${destination === "members" ? "/members" : ""}`} className={`dao-switcher-option${current ? " dao-switcher-option--current" : ""}`} aria-current={current ? "page" : undefined} onClick={() => close(true)}>
                      <span className="dao-switcher-avatar" aria-hidden="true">{initials(item.name)}</span>
                      <span className="dao-switcher-option-copy"><strong>{item.name}</strong><span>{item.slug}</span></span>
                      {current ? <span className="dao-switcher-check"><span className="dao-sr-only">Current community</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg></span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="dao-switcher-empty">{communities.length === 0 ? "No communities are available to this account." : "No communities match your search. Try another name."}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
