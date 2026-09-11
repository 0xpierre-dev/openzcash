export type PublicationView = "monthly" | "operations" | "sources";

export function publicationView(value?: string | null): PublicationView {
  return value === "voter" ? "operations" : value === "operations" || value === "sources" ? value : "monthly";
}

export function publicationTarget(href: string, basePath: string, origin: string) {
  try {
    const url = new URL(href, origin);
    if (![origin, "https://openzcash.org"].includes(url.origin) || url.pathname !== basePath) return null;
    const view = url.searchParams.get("publication");
    if (view !== "monthly" && view !== "operations") return null;
    const page = Number(url.hash.slice(1));
    return { view, page: Number.isInteger(page) && page > 0 ? page : 1 } as const;
  } catch {
    return null;
  }
}
