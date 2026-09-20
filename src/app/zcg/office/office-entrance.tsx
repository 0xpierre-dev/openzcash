"use client";
import { useState, type ReactNode } from "react";
import type { OfficeMember } from "./scene";
export function OfficeEntrance({
  members,
  proposalsCount,
  children,
}: {
  members: OfficeMember[];
  proposalsCount: number;
  children: ReactNode;
}) {
  const [entered, setEntered] = useState(false);
  if (entered) return <div className="office-room">{children}</div>;
  return (
    <>
      <section className="rd-office-entry">
        <div className="rd-office-copy">
          <span>Governance, with a place to meet</span>
          <h1>
            Step inside
            <br />
            the ZCG office.
          </h1>
          <p>
            A living room for community grants. Meet the committee and explore
            the proposals under review, each represented by a zebra.
          </p>
          <button type="button" onClick={() => setEntered(true)}>
            Enter the 3D office <span aria-hidden>→</span>
          </button>
          <small>
            {proposalsCount} proposals under review · Interactive 3D experience
          </small>
        </div>
        <div className="rd-office-art" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/illustrations/zcg-door.png" width={520} height={420} alt="" />
        </div>
      </section>
      <div className="rd-office-members">
        {members.map((m) => (
          <span key={m.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={m.img} width={30} height={30} alt="" />
            {m.name}
          </span>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-stone-600">
        Each zebra is a grant proposal under review. Status changes appear the
        next day (Brasília time), based on GitHub and the official spreadsheet.
        Drag to look around, scroll to zoom and select a proposal to read its
        summary and application date. The room loads when you enter.
      </p>
    </>
  );
}
