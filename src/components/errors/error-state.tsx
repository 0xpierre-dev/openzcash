import { ERROR_BRAND } from "./error-brand";
import { ERROR_STYLES } from "./error-styles";

export const ERROR_CONTENT = {
  error: {
    label: "Something went wrong",
    title: "A moment off track.",
    description: "We couldn’t load this page. Try again, or head back to the start.",
    hint: "If it keeps happening, please try again later.",
  },
  "not-found": {
    label: "404 · Page not found",
    title: "A different way forward.",
    description: "This link doesn’t lead to a page. Find your way back to the Zcash ecosystem.",
    hint: "Check the address if you followed a saved link.",
  },
  unavailable: {
    label: "Temporarily unavailable",
    title: "A brief interruption.",
    description: "OpenZcash isn’t responding right now. Please try again in a moment.",
    hint: "You can keep this tab open and try again later.",
  },
} as const;

export type ErrorKind = keyof typeof ERROR_CONTENT;

/** No data fetching, router, fonts, shell or external assets in the fallback. */
export function ErrorState({ kind, onRetry, standalone = false }: {
  kind: ErrorKind;
  onRetry?: () => void;
  standalone?: boolean;
}) {
  const content = ERROR_CONTENT[kind];
  const isMissing = kind === "not-found";
  return (
    <section className={`oz-error${standalone ? " oz-error--standalone" : ""}`} aria-labelledby="oz-error-title">
      <style>{ERROR_STYLES}</style>
      <div className="oz-error-wrap">
        {/* Full document navigation also recovers a broken client router. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="oz-error-brand" href="/" aria-label="OpenZcash home">
          {/* Embedded official mark works without an image request to the origin. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ERROR_BRAND} width="44" height="44" alt="" />
          <span>OpenZcash<span className="oz-error-dot">.</span></span>
        </a>
        <div className="oz-error-main">
          <div className="oz-error-copy">
            <p className="oz-error-label"><span />{content.label}</p>
            <h1 id="oz-error-title">{content.title}</h1>
            <p className="oz-error-description">{content.description}</p>
            <div className="oz-error-actions">
              {!isMissing && (onRetry ? (
                <button className="oz-error-primary" type="button" onClick={onRetry}>
                  <RetryIcon />Try again
                </button>
              ) : (
                // Empty href retries the current document, including query parameters.
                <a className="oz-error-primary" href=""><RetryIcon />Try again</a>
              ))}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a className={isMissing ? "oz-error-primary" : "oz-error-secondary"} href="/">
                Back to home<span aria-hidden="true">↗</span>
              </a>
            </div>
            <p className="oz-error-hint">{content.hint}</p>
          </div>
          <div className="oz-error-art" aria-hidden="true">
            <span className="oz-error-orbit oz-error-orbit--outer" />
            <span className="oz-error-orbit oz-error-orbit--inner" />
            <span className="oz-error-orbit-dot" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ERROR_BRAND} width="280" height="280" alt="" />
          </div>
        </div>
        <div className="oz-error-footer"><span>The ecosystem, in one place.</span><span>OPENZCASH</span></div>
      </div>
    </section>
  );
}

function RetryIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M20 12a8 8 0 1 0-2 5M20 12l-2-5" /></svg>;
}
