import Link from "next/link";
import {
  SectionHeading,
  SourceNote,
} from "@/components/workspace";
import { Card, PageHeader, Stat } from "@/components/ui";
import { Synced } from "@/components/synced";
import { formatUsdCents } from "@/lib/zcg/format";
import { getElections, getMeetings } from "@/lib/zcg/governance-repo";
import { getStipendSummary } from "@/lib/zcg/stipends";
import { getZcapMembers, ZCAP_SHEET_URL } from "@/lib/zcap/members";
import { CurrentCommittee } from "../current-committee";
import { ElectionsSection } from "../elections-section";
import { BudgetCards } from "../budget-cards";
import {
  COHORTS,
  MEMBERS,
  SEATED_FROM,
  membersByCohort,
} from "../current-committee-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "ZCG Committee · OpenZcash" };

const LATEST_MINUTES = 5;

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][(m ?? 1) - 1];
  return `${month} ${d}, ${y}`;
}

export default async function CommitteePage() {
  // Each block degrades on its own: a source that is momentarily unreachable
  // hides its figure instead of the page.
  const [stipends, meetings, elections, zcap] = await Promise.all([
    getStipendSummary().catch(() => null),
    getMeetings().catch(() => []),
    getElections().catch(() => []),
    getZcapMembers().catch(() => null),
  ]);
  const latestMinutes = meetings.slice(0, LATEST_MINUTES);
  const currentNames = new Set(MEMBERS.map((m) => m.name.toLowerCase()));
  const seats = MEMBERS.length;

  return (
    <>
      <PageHeader
        title="The ZCG committee"
        subtitle="Who decides, for how long, and paid how. Seats and roles come from source-linked public facts; stipends from the ZCG monthly-payments sheet; minutes from the community forum; the electorate from the Foundation's public ZCAP roster."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Seats"
          value={String(seats)}
          sub={`current members · from ${SEATED_FROM}`}
        />
        <Stat
          label="ZCAP voters"
          value={zcap && zcap.length > 0 ? String(zcap.length) : "n/a"}
          sub={
            zcap && zcap.length > 0
              ? "advisory panel that elects ZCG"
              : "roster temporarily unavailable"
          }
        />
        <Stat
          label="Stipends paid"
          value={
            stipends
              ? formatUsdCents(stipends.totalUsd, { compact: true })
              : "n/a"
          }
          sub={
            stipends
              ? `${stipends.members.length} members · ${stipends.totalPayments} payments`
              : "ledger temporarily unavailable"
          }
          tone="warn"
        />
        <Stat
          label="Meeting minutes"
          value={String(meetings.length)}
          sub={
            meetings[0]
              ? `latest ${formatDay(meetings[0].meetingDate)}`
              : "none recorded yet"
          }
        />
      </section>


      <CurrentCommittee />

      <section className="mb-8">
        <SectionHeading
          title="Terms by cohort"
          description="Seats are filled in two half-yearly elections. Term end dates come from each member's public record; the elections that filled them are listed below."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {membersByCohort().map(({ cohort, members }) => (
            <Card key={cohort}>
              <p className="text-[11px] font-medium uppercase tracking-wider text-stone-600">
                {COHORTS[cohort].label}
              </p>
              <p className="mt-1 text-sm text-stone-900">
                <span className="font-semibold">{members.length}</span>{" "}
                {members.length === 1 ? "seat" : "seats"} · elected in the{" "}
                {COHORTS[cohort].elected} · term to{" "}
                <span className="tnum font-medium">
                  {COHORTS[cohort].termEnds}
                </span>
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {members.map((m) => (
                  <li key={m.name}>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white py-0.5 pl-0.5 pr-2.5 text-xs font-medium text-stone-800 hover:border-amber-300/70"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={m.img}
                        alt=""
                        width={20}
                        height={20}
                        className="h-5 w-5 rounded-full object-cover"
                      />
                      {m.name} ↗
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <ElectionsSection />

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <SectionHeading
            title="Compensation"
            count={stipends ? stipends.members.length : undefined}
            description="Monthly stipends paid to committee members, summed from the monthly-payments tab. Former members stay in the record."
            action={
              <Link
                href="/zcg/stipends"
                className="text-xs font-medium text-amber-700 hover:text-amber-900"
              >
                All stipends →
              </Link>
            }
          />
          {stipends && stipends.members.length > 0 ? (
            <div>
              {stipends.members.map((m) => (
                <div className="rd-breakdown" key={m.member}>
                  <span>
                    <Link
                      href={`/zcg/recipient?r=${encodeURIComponent(m.member)}`}
                      className="hover:text-amber-700"
                    >
                      {m.member}
                      {currentNames.has(m.member.toLowerCase())
                        ? ""
                        : " · former"}
                    </Link>
                    <small>
                      {m.payments} payments
                      {m.lastPaid ? ` · last ${m.lastPaid}` : ""}
                    </small>
                  </span>
                  <strong className="tnum">{formatUsdCents(m.totalUsd)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-600">
              {stipends
                ? "No monthly stipend rows are present in the ledger yet."
                : "Ledger temporarily unavailable."}
            </p>
          )}
        </Card>

        <Card>
          <SectionHeading
            title="Latest meeting minutes"
            count={meetings.length || undefined}
            description="The most recent committee minutes, straight from the community forum."
            action={
              <Link
                href="/zcg/meetings"
                className="text-xs font-medium text-amber-700 hover:text-amber-900"
              >
                All meetings →
              </Link>
            }
          />
          {latestMinutes.length > 0 ? (
            <div>
              {latestMinutes.map((m) => (
                <div className="rd-breakdown" key={m.id}>
                  <span>
                    <a
                      href={m.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-amber-700"
                    >
                      {m.title} ↗
                    </a>
                    <small>Zcash Community Grants committee</small>
                  </span>
                  <strong className="tnum">{formatDay(m.meetingDate)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-stone-600">
              No meeting minutes recorded yet.
            </p>
          )}
        </Card>
      </div>

      <section className="mb-8">
        <SectionHeading
          title="Discretionary budget"
          description="The committee's own annual operating budget, fixed in ZEC and shown in both units."
          action={
            <Link
              href="/zcg/budget"
              className="text-xs font-medium text-amber-700 hover:text-amber-900"
            >
              Full budget →
            </Link>
          }
        />
        <BudgetCards />
      </section>

      <SourceNote>
        Members, terms and roles: source-linked public facts on each card.
        Elections: {elections.length} recorded. Stipends: the ZCG
        monthly-payments tab. Minutes: the Zcash Community Forum. Electorate:
        the Foundation&apos;s{" "}
        <a
          href={ZCAP_SHEET_URL}
          target="_blank"
          rel="noreferrer"
          className="text-amber-700 hover:underline"
        >
          public ZCAP roster ↗
        </a>
        , whose full membership lives on the Zcash Foundation page.
      </SourceNote>
      <Synced className="mt-4" />
    </>
  );
}
