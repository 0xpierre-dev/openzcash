import type { CardText } from "@/lib/seo/card-params";
import { CARD_FONTS } from "@/lib/seo/card-assets";
import {
  BAND_HEIGHT,
  BODY,
  BODY_TOP,
  FOOTER_HEIGHT,
  GUTTER,
  TITLE_LEADING,
  TITLE_MAX_LINES,
  balancedBlock,
  clampedBlock,
  titleSize,
  typeset,
} from "./card-type";

/**
 * The 1200×630 share card, drawn by Satori (flexbox and inline styles only).
 * Light production palette: cream canvas, ink type, the sidebar banner's soft
 * gold band across the top with the brand centred, and gold only for the
 * section and the figure. Everything is centred; the domain sits on a quiet
 * footer line. Every size stays legible when a chat app shows the card about
 * 300px wide.
 */

const INK = "#1c1917";
const MUTED = "#57534e";
const DIM = "#78716c";
/** The site's --accent-ink: gold text (about 5:1 on the canvas). */
const GOLD_INK = "#92600f";
const CANVAS = "#faf8f4";
const LINE = "#e9e3d6";
const BAND = "linear-gradient(180deg, #f6edd3 0%, #f3ebd8 100%)";

const MARK = 60;
const { eyebrow: EYEBROW, kicker: KICKER, stat: STAT } = BODY;

/** The site's own line when the home is shared. */
const SITE_CARD: CardText = {
  title: "Zcash funding, in the open",
  kicker:
    "ZCG and Coinholder grants, treasuries and governance, mirrored from the official sources.",
};

function Mark({ src }: { src: string }) {
  // The PNG centres the coin in half its width; crop to the coin.
  return (
    <div
      style={{ display: "flex", width: MARK, height: MARK, overflow: "hidden" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img */}
      <img
        src={src}
        width={MARK * 2}
        height={MARK * 2}
        alt=""
        style={{ margin: -MARK / 2 }}
      />
    </div>
  );
}

function Band({ mark }: { mark: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        height: BAND_HEIGHT,
        padding: `0 ${GUTTER}px`,
        backgroundImage: BAND,
        borderBottom: `1px solid ${LINE}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        {mark ? <Mark src={mark} /> : null}
        <div
          style={{
            fontFamily: CARD_FONTS.wordmark,
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: "0.01em",
            color: INK,
          }}
        >
          OpenZcash
        </div>
      </div>
    </div>
  );
}

function Stat({ value }: { value: string }) {
  return (
    <div
      style={{
        display: "block",
        marginTop: STAT.gap,
        fontSize: STAT.fontSize,
        lineHeight: STAT.leading,
        fontWeight: 500,
        color: GOLD_INK,
        wordBreak: "break-word",
      }}
    >
      {value}
    </div>
  );
}

export function ShareCard({
  card,
  mark,
}: {
  card: CardText | null;
  mark: string | null;
}) {
  const site = card === null;
  const text = card ?? SITE_CARD;
  const title = typeset(text.title);
  const [kicker, stat, section] = [text.kicker, text.stat, text.section].map(
    (value) => (value ? typeset(value) : undefined),
  );
  const size = titleSize({ title, kicker, stat, section }, site);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: CANVAS,
        color: INK,
        fontFamily: CARD_FONTS.text,
      }}
    >
      <Band mark={mark} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          flexGrow: 1,
          overflow: "hidden",
          padding: `${BODY_TOP}px ${GUTTER}px 0`,
        }}
      >
        {section ? (
          <div
            style={{
              ...clampedBlock(1),
              marginBottom: EYEBROW.gap,
              fontSize: EYEBROW.fontSize,
              lineHeight: EYEBROW.leading,
              fontWeight: 500,
              color: GOLD_INK,
            }}
          >
            {section}
          </div>
        ) : null}
        <div
          style={{
            ...balancedBlock(size, TITLE_LEADING, TITLE_MAX_LINES),
            fontSize: size,
            fontWeight: 500,
            lineHeight: TITLE_LEADING,
            letterSpacing: "-0.025em",
            color: INK,
          }}
        >
          {title}
        </div>
        {kicker ? (
          <div
            style={{
              ...clampedBlock(KICKER.lines),
              marginTop: KICKER.gap,
              fontSize: KICKER.fontSize,
              lineHeight: KICKER.leading,
              color: MUTED,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {stat ? <Stat value={stat} /> : null}
      </div>
      <div
        style={{
          display: "flex",
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          height: FOOTER_HEIGHT,
          fontSize: 26,
          color: DIM,
          letterSpacing: "0.01em",
        }}
      >
        openzcash.org
      </div>
    </div>
  );
}
