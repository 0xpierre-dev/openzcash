import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const LOCAL_ORIGIN = "https://proposal.invalid";

function safeHref(value: string): string | undefined {
  const href = value.trim();

  if (
    !href ||
    href.startsWith("//") ||
    Array.from(href).some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127 || character === "\\") ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(href)
  ) {
    return undefined;
  }

  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
      const url = new URL(href);

      if (url.protocol === "mailto:") {
        return url.pathname ? href : undefined;
      }

      return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password
        ? href
        : undefined;
    }

    return new URL(href, LOCAL_ORIGIN).origin === LOCAL_ORIGIN ? href : undefined;
  } catch {
    return undefined;
  }
}

const components: Components = {
  // The proposal title owns h1; Markdown sections start at h2.
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
  h5: ({ children }) => <h6>{children}</h6>,
  h6: ({ children }) => <h6>{children}</h6>,
  a: ({ children, href, title }) => {
    const destination = href ? safeHref(href) : undefined;

    if (!destination) return <span>{children}</span>;

    const external = /^https?:/i.test(destination);

    return (
      <a
        href={destination}
        title={title}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
      >
        {children}
      </a>
    );
  },
  // Proposal authors cannot make readers contact an image host or tracking pixel.
  img: ({ alt }) => <span className="dao-markdown-image">{alt ? `Image: ${alt}` : "Image omitted"}</span>,
  table: ({ children }) => (
    <div className="dao-markdown-table" role="region" aria-label="Proposal table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  pre: ({ children }) => <pre tabIndex={0} aria-label="Code block">{children}</pre>,
  input: ({ checked, type }) => type === "checkbox"
    ? <input type="checkbox" checked={Boolean(checked)} disabled aria-label={checked ? "Completed item" : "Incomplete item"} />
    : null
};

export function ProposalMarkdown({ children }: { children: string }) {
  return (
    <div className="dao-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={components}
        urlTransform={(url, key) => key === "href" ? safeHref(url) : undefined}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
