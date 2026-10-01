import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ compact: false }));
vi.mock("./use-media-query", () => ({ useMediaQuery: () => state.compact }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => createElement("a", { href, ...rest }, children),
}));
import { TreasuryPool } from "./treasury-pool";

const render = (compact: boolean) => {
  state.compact = compact;
  return renderToStaticMarkup(
    <TreasuryPool
      href="/lockbox"
      className="rd-treasury-pool"
      title="1,234.5678 ZEC"
    >
      <span>Lockbox</span>
    </TreasuryPool>,
  );
};

describe("TreasuryPool", () => {
  it("links to the pool's page on wide screens", () => {
    const html = render(false);
    expect(html).toContain('<a href="/lockbox"');
    expect(html).toContain('class="rd-treasury-pool"');
    expect(html).toContain('title="1,234.5678 ZEC"');
    expect(html).toContain("<span>Lockbox</span>");
  });

  it("is plain figures at tab-bar width, with no link to another screen", () => {
    const html = render(true);
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).toContain('<div class="rd-treasury-pool"');
    expect(html).toContain('title="1,234.5678 ZEC"');
    expect(html).toContain("<span>Lockbox</span>");
  });
});
