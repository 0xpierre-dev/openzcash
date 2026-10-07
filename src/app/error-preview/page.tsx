import { notFound } from "next/navigation";
import { ErrorState, ERROR_CONTENT, type ErrorKind } from "@/components/errors/error-state";
import { ErrorPreviewTrigger } from "./trigger";

export const metadata = { title: "Error preview · OpenZcash", robots: { index: false, follow: false } };

/** Local-only design/recovery fixture; never allows a visitor to crash production. */
export default async function ErrorPreview({ searchParams }: {
  searchParams: Promise<{ kind?: string; simulate?: string }>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  if (params.simulate === "page") return <ErrorPreviewTrigger />;
  const kind: ErrorKind = Object.hasOwn(ERROR_CONTENT, params.kind ?? "") ? params.kind as ErrorKind : "error";
  return (
    <>
      <nav aria-label="Error preview" style={{ display: "flex", flexWrap: "wrap", gap: 18, padding: "16px 24px", fontSize: 13 }}>
        <a href="?kind=error">Page error</a>
        <a href="?kind=not-found">Not found</a>
        <a href="/service-unavailable.html">Service unavailable</a>
        <a href="?simulate=page">Test exception & recovery</a>
      </nav>
      <ErrorState kind={kind} />
    </>
  );
}
