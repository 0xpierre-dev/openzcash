import { readFileSync } from "node:fs";
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// A root-layout failure must not prevent the fallback itself from rendering.
vi.mock("@/app/layout", () => { throw new Error("Root layout is unavailable"); });
vi.mock("@/components/shell-gate", () => { throw new Error("Shell is unavailable"); });
vi.mock("@/lib/db/client", () => { throw new Error("Database is unavailable"); });
vi.mock("next/font/google", () => { throw new Error("Fonts are unavailable"); });
vi.mock("next/navigation", () => { throw new Error("Router is unavailable"); });

import AppError from "@/app/error";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";
import { ERROR_BRAND } from "./error-brand";
import { ErrorState } from "./error-state";

// These fallbacks are stateless functions, so their actual button handlers can
// be exercised without adding a browser DOM dependency to the test suite.
function buttonsIn(node: ReactNode): ReactElement<ComponentProps<"button">>[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return [];
    if (typeof child.type === "function") {
      const render = child.type as (props: { children?: ReactNode }) => ReactNode;
      return buttonsIn(render(child.props));
    }
    if (child.type === "button") return [child as ReactElement<ComponentProps<"button">>];
    return buttonsIn(child.props.children);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("branded error fallbacks", () => {
  it("renders the global error as a complete document without shell, data, router or external assets", () => {
    const fetch = vi.fn(() => { throw new Error("Network is unavailable"); });
    vi.stubGlobal("fetch", fetch);

    const html = renderToStaticMarkup(<GlobalError retry={vi.fn()} />);

    expect(html).toMatch(/^(?:<!DOCTYPE html>)?<html lang="en">/);
    expect(html).toContain("<head>");
    expect(html).toContain("<title>Unable to load · OpenZcash</title>");
    expect(html).toContain('name="viewport"');
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toMatch(/<body[^>]*>/);
    expect(html).toMatch(/<h1\b[^>]*>A moment off track\.<\/h1>/);
    expect(html).toContain("We couldn’t load this page.");
    expect(html).toMatch(/<style>[^<]+<\/style>/);
    expect(html).toMatch(/<\/body><\/html>$/);
    expect(html).not.toMatch(/<(?:link|script)\b|@import\b|url\(/i);
    const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)];
    expect(images).toHaveLength(2);
    expect(images.every(([, src]) => src === ERROR_BRAND)).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["route", AppError],
    ["global", GlobalError],
  ])("keeps raw error details out of the %s fallback", (_name, Component) => {
    const error = Object.assign(new Error("PRIVATE_DATABASE_PASSWORD_FAILURE"), {
      stack: "PRIVATE_STACK_TRACE /internal/database.ts:12",
      digest: "PRIVATE_ERROR_DIGEST",
    });
    const props = { error, retry: vi.fn() };
    const html = renderToStaticMarkup(<Component {...props} />);

    expect(html).toContain("Something went wrong");
    expect(html).not.toContain(error.message);
    expect(html).not.toContain(error.stack);
    expect(html).not.toContain(error.digest);
  });

  it.each([
    ["route", AppError],
    ["global", GlobalError],
  ])("invokes Next's retry callback from the %s fallback button", (_name, Component) => {
    const retry = vi.fn();
    const buttons = buttonsIn(<Component retry={retry} />);

    expect(buttons).toHaveLength(1);
    const [button] = buttons;
    expect(renderToStaticMarkup(button)).toContain("Try again");
    expect(button.props.type).toBe("button");
    expect(retry).not.toHaveBeenCalled();
    expect(button.props.onClick).toBeTypeOf("function");
    button.props.onClick!({} as Parameters<NonNullable<typeof button.props.onClick>>[0]);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("renders a real missing-page explanation and home link without offering a retry", () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain("404 · Page not found");
    expect(html).toMatch(/<h1\b[^>]*>A different way forward\.<\/h1>/);
    expect(html).toContain("This link doesn’t lead to a page.");
    expect(html).toMatch(/<a\b[^>]*href="\/"[^>]*>Back to home/);
    expect(html).not.toContain("Try again");
    expect(html).not.toContain("<button");
  });

  it("offers a same-document reload for an unavailable page without JavaScript", () => {
    const html = renderToStaticMarkup(<ErrorState kind="unavailable" standalone />);

    expect(html).toContain("Temporarily unavailable");
    expect(html).toContain("OpenZcash isn’t responding right now.");
    expect(html).toMatch(/<a\b[^>]*href=""[^>]*>.*?Try again<\/a>/);
    expect(html).toMatch(/<a\b[^>]*href="\/"[^>]*>Back to home/);
    expect(html).not.toContain("<button");
  });

  it("embeds the official OpenZcash mark byte for byte", () => {
    const officialMark = readFileSync(new URL("../../../public/logos/marks/openzcash.png", import.meta.url));

    expect(ERROR_BRAND).toBe(`data:image/png;base64,${officialMark.toString("base64")}`);
  });
});
