"use client";

import { ErrorState } from "@/components/errors/error-state";

/** Independent of the failed root layout, providers, fonts and stylesheet. */
export default function GlobalError({ retry }: { retry: () => void }) {
  return (
    <html lang="en">
      <head>
        <title>Unable to load · OpenZcash</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body style={{ margin: 0 }}>
        <main><ErrorState kind="error" standalone onRetry={retry} /></main>
      </body>
    </html>
  );
}
