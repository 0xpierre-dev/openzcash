/* eslint-disable @next/next/no-head-element -- standalone HTML export, not a Next page. */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { ErrorState } from "../src/components/errors/error-state";
import { ERROR_BRAND } from "../src/components/errors/error-brand";

// One visual source for the application and the independent edge response.
const officialMark = `data:image/png;base64,${readFileSync(new URL("../public/logos/marks/openzcash.png", import.meta.url)).toString("base64")}`;
if (ERROR_BRAND !== officialMark) throw new Error("Refresh the embedded official error-page mark before building.");
const output = "<!doctype html>" + renderToStaticMarkup(
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="robots" content="noindex, nofollow" />
      <meta name="color-scheme" content="light dark" />
      <title>Temporarily unavailable · OpenZcash</title>
    </head>
    <body style={{ margin: 0 }}><main><ErrorState kind="unavailable" standalone /></main></body>
  </html>,
) + "\n";
const destination = new URL("../public/service-unavailable.html", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(destination, "utf8") !== output) throw new Error("Run npm run errors:build to update the static fallback.");
  console.info("Error fallback matches the application UI.");
} else {
  writeFileSync(destination, output);
  console.info("Built self-contained service-unavailable.html.");
}
