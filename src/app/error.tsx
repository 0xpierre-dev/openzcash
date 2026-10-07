"use client";

import { ErrorState } from "@/components/errors/error-state";

/** Next 16.3 retries the server request as well as the failed render. */
export default function AppError({ retry }: { retry: () => void }) {
  return <ErrorState kind="error" onRetry={retry} />;
}
