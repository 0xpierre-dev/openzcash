import Link from "next/link";
import { ROUNDS } from "@/lib/coinholder/rounds";
import {
  CLOSE_PRICE_SOURCE,
  formatPct,
  formatZec,
  voteValue,
} from "@/lib/coinholder/derive";
import { Stat } from "./stat";
import styles from "./coinholders.module.css";

export type TodayPrice = { usd: number; source: string } | null;

const usd = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumSignificantDigits: 3,
  });
const price = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const zecShort = (zec: number) =>
  zec >= 1_000_000 ? `${(zec / 1_000_000).toFixed(2)}M` : `${Math.round(zec / 1000)}K`;
const times = (x: number) => `${x >= 10 ? Math.round(x) : x.toFixed(2)}×`;
const closeDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * What the ZEC behind each vote was worth: at the close of the day voting
 * ended, and at today's price, beside the money it decided.
 */
export function VoteValue({
  today,
  href,
}: {
  today: TodayPrice;
  href: (roundId: string) => string;
}) {
  const rows = [...ROUNDS].reverse().map((r) => ({
    r,
    v: voteValue(r, today?.usd ?? null),
  }));
  const voted = rows.filter(
    (x): x is { r: (typeof x)["r"]; v: NonNullable<(typeof x)["v"]> } =>
      x.v !== null && x.v.atCloseUsd !== null,
  );
  if (!voted.length) return null;
  const first = voted[0];
  const latest =
    voted.filter((x) => x.r.status === "results").at(-1) ?? voted.at(-1)!;
  const growth = latest.v.atCloseUsd! / first.v.atCloseUsd!;
  const zecGrowth = latest.v.zec / first.v.zec;
  const priceGrowth = latest.v.closeUsd! / first.v.closeUsd!;
  const scale =
    Math.max(
      ...voted.flatMap((x) => [x.v.atCloseUsd ?? 0, x.v.todayUsd ?? 0]),
    ) * 1.04;
  const width = (value: number | null) =>
    value === null ? "0%" : `${(value / scale) * 100}%`;

  return (
    <section aria-labelledby="vote-value">
      <h2 id="vote-value" className={styles.sectionTitle}>
        Value of the vote
      </h2>
      <div className={styles.panel}>
        <div className={`${styles.stats} ${styles.flush}`}>
          <Stat
            label="Stake that voted"
            value={usd(latest.v.atCloseUsd!)}
            sub={`${latest.r.label} · ${formatZec(latest.v.zec)} ZEC at ${price(latest.v.closeUsd!)}`}
          />
          <Stat
            label={`Since the ${first.r.label.toLowerCase()}`}
            value={times(growth)}
            sub={`${times(zecGrowth)} the ZEC · ${times(priceGrowth)} the price`}
          />
          <Stat
            label="Requests against the stake"
            value={
              latest.v.requestedShareOfStake === null
                ? "·"
                : formatPct(latest.v.requestedShareOfStake, 2)
            }
            sub={`${usd(latest.v.requestedUsd)} asked of ${usd(latest.v.atCloseUsd!)} voting`}
          />
        </div>

        <div className={styles.panelBody}>
          <ol
            className={styles.valueBars}
            aria-label="Value of the ZEC that voted, by round"
          >
            {rows.map(({ r, v }) => (
              <li key={r.id}>
                <span className={styles.valueRound}>
                  <Link
                    href={href(r.id)}
                    scroll={false}
                    className={styles.barLabel}
                  >
                    {r.label}
                  </Link>
                  {v ? <small>{zecShort(v.zec)} ZEC</small> : null}
                </span>
                {v && v.atCloseUsd !== null ? (
                  <>
                    <span className={styles.barTrack} aria-hidden>
                      <span
                        className={styles.barFill}
                        style={{ width: width(v.atCloseUsd) }}
                      />
                    </span>
                    <span className={styles.valueFigure}>
                      <strong>{usd(v.atCloseUsd)}</strong>
                      <span className="sr-only"> at the close, </span>
                    </span>
                    <span className={styles.barTrack} aria-hidden>
                      <span
                        className={`${styles.barFill} ${styles.barToday}`}
                        style={{ width: width(v.todayUsd) }}
                      />
                    </span>
                    <span className={styles.valueFigure}>
                      {v.todayUsd === null ? "·" : usd(v.todayUsd)}
                      <span className="sr-only"> at today&apos;s price</span>
                    </span>
                  </>
                ) : (
                  <span className={styles.valueNone}>no vote</span>
                )}
              </li>
            ))}
          </ol>
          <p className={styles.valueLegend}>
            <span>
              <span
                className={`${styles.swatch} ${styles.o_funded}`}
                aria-hidden
              />
              At the close of the day voting ended
            </span>
            <span>
              <span
                className={`${styles.swatch} ${styles.swatchToday}`}
                aria-hidden
              />
              {today
                ? `At today's price, ${price(today.usd)} a ZEC (${today.source})`
                : "Today's price unavailable"}
            </span>
          </p>

          <div className={styles.tableScroll}>
            <table className={styles.mini}>
              <caption className="sr-only">
                ZEC that voted in each round, its value at the close and today,
                and the money requested and funded
              </caption>
              <thead>
                <tr>
                  <th scope="col">Round</th>
                  <th scope="col">ZEC voted</th>
                  <th scope="col">ZEC at the close</th>
                  <th scope="col">Value at the close</th>
                  <th scope="col">Value today</th>
                  <th scope="col">Requested</th>
                  <th scope="col">Funded</th>
                  <th scope="col">Requests ÷ stake</th>
                </tr>
              </thead>
              <tbody>
                {voted.map(({ r, v }) => (
                  <tr key={r.id}>
                    <th scope="row">
                      <Link href={href(r.id)} scroll={false}>
                        {r.label}
                      </Link>
                      <small>{closeDay(r.closePrice!.date)}</small>
                    </th>
                    <td>{formatZec(v.zec)}</td>
                    <td>{price(v.closeUsd!)}</td>
                    <td>{usd(v.atCloseUsd!)}</td>
                    <td>{v.todayUsd === null ? "·" : usd(v.todayUsd)}</td>
                    <td>{v.requestedUsd ? usd(v.requestedUsd) : "·"}</td>
                    <td>{v.requestedUsd ? usd(v.fundedUsd) : "·"}</td>
                    <td>
                      {v.requestedShareOfStake === null
                        ? "·"
                        : formatPct(v.requestedShareOfStake, 2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.panelNote}>
            ZEC voted is the largest single vote of the round. Close:{" "}
            <a href={CLOSE_PRICE_SOURCE.href} target="_blank" rel="noreferrer">
              {CLOSE_PRICE_SOURCE.label} ↗
            </a>
            . Requests are set in USD; the ratification poll asked for no money.
          </p>
        </div>
      </div>
    </section>
  );
}
