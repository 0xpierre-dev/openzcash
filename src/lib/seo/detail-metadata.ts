import type { Metadata } from "next";
import { pageMetadata } from "./page-metadata";

/**
 * Link previews of the ledger's detail pages (/zcg/grant?g=, /zcg/recipient?r=).
 * The query names the record, and the page answers 200 even for a name that
 * does not exist (its not-found screen streams behind the loading shell). So
 * a card only ever carries a name the ledger returned: the caller looks the
 * record up and passes null when nothing matched, which shares the generic
 * card and no og:url.
 */

const GRANT_PAGE = {
  title: "Grant detail · OpenZcash",
  description:
    "One ZCG grant, milestone by milestone: budgeted USD, disbursed ZEC and what is still open, from the public ledger.",
};

const RECIPIENT_PAGE = {
  title: "Recipient ledger · OpenZcash",
  description:
    "Unpaid and paid entries for one recipient in the public ledger, including committee stipends, grants and reimbursements.",
};

/** A grant as the ledger stores it. */
export type GrantShare = {
  /** The stored project name (the page's ?g= key). */
  name: string;
  recipient: string | null;
  coinholder: boolean;
  paid: number;
  milestones: number;
};

/** A recipient as the ledger names it. */
export type RecipientShare = {
  /** The canonical recipient name the page shows. */
  name: string;
  paid: number;
  unpaid: number;
};

const plural = (count: number, one: string, many: string) =>
  count === 1 ? one : many;

export function grantMetadata(grant: GrantShare | null): Metadata {
  if (!grant) {
    return pageMetadata({
      ...GRANT_PAGE,
      card: { title: "Grant detail", section: "ZCG" },
    });
  }
  return pageMetadata({
    ...GRANT_PAGE,
    shareTitle: `${grant.name} · ${grant.coinholder ? "Coinholder grant" : "ZCG grant"}`,
    path: `/zcg/grant?g=${encodeURIComponent(grant.name)}`,
    card: {
      title: grant.name,
      kicker: grant.recipient ? `Grant to ${grant.recipient}` : "Grant detail",
      stat: `${grant.paid} of ${grant.milestones} ${plural(grant.milestones, "milestone", "milestones")} paid`,
      section: grant.coinholder ? "Coinholder Grants" : "ZCG",
    },
  });
}

export function recipientMetadata(recipient: RecipientShare | null): Metadata {
  if (!recipient) {
    return pageMetadata({
      ...RECIPIENT_PAGE,
      card: { title: "Recipient ledger", section: "ZCG" },
    });
  }
  const entries = recipient.paid + recipient.unpaid;
  return pageMetadata({
    ...RECIPIENT_PAGE,
    shareTitle: `${recipient.name} · Recipient ledger`,
    path: `/zcg/recipient?r=${encodeURIComponent(recipient.name)}`,
    card: {
      title: recipient.name,
      kicker: "Recipient ledger",
      stat: `${recipient.paid} paid · ${recipient.unpaid} unpaid ${plural(entries, "entry", "entries")}`,
      section: "ZCG",
    },
  });
}
