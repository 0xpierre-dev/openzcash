import { fireEvent, render, screen, within } from "@testing-library/react";
import { ParticipateHistory } from "@/components/participate-history";
import type { HistoryRecord } from "@/lib/domain/participate-history";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
const rows: HistoryRecord[] = Array.from({ length: 19 }, (_, index) => ({ id: `p-${index}`, date: "2026-09-28", process: "committee", outcome: index < 16 ? "Approved" : "Rejected", subject: `Proposal ${String(index + 1).padStart(2, "0")}`, subjectHref: null, detail: "Team · $8,000 requested", sources: [{ label: "Minutes", href: "https://forum.zcashcommunity.com/t/meeting/123" }] }));
const data = { rows, origin: "https://openzcash.org" };

it("paginates the full register and resets the page when the outcome or search changes", () => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  render(<ParticipateHistory data={data} />);
  expect(screen.getByRole("status")).toHaveTextContent("1–15 of 19 decisions");
  fireEvent.click(screen.getByRole("button", { name: "Next →" }));
  expect(screen.getByRole("status")).toHaveTextContent("16–19 of 19 decisions");
  fireEvent.click(screen.getByRole("button", { name: "Rejected" }));
  expect(screen.getByRole("status")).toHaveTextContent("1–3 of 3 decisions");
  expect(within(screen.getByRole("list")).getAllByRole("heading")).toHaveLength(3);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Proposal 19" } });
  expect(screen.getByRole("status")).toHaveTextContent("1–1 of 1 decisions");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "missing" } });
  expect(screen.getByRole("button", { name: /Export CSV/ })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  expect(screen.getByRole("status")).toHaveTextContent("1–15 of 19 decisions");
});

it("keeps sources as explicitly external references and distinguishes them from pilot votes", () => {
  render(<ParticipateHistory data={{ ...data, rows: [{ ...rows[0], subjectHref: "/zcg/grant?g=Example" }] }} />);
  expect(screen.getByRole("link", { name: /Grant record/ })).toHaveAttribute("href", "https://openzcash.org/zcg/grant?g=Example");
  expect(screen.getByRole("link", { name: /Minutes/ })).toHaveAttribute("rel", "noopener noreferrer");
  expect(screen.getByText(/separate from votes recorded in this pilot/)).toBeInTheDocument();
});

it("offers an inline retry on failure, not a replacement portal or an empty success", () => {
  render(<ParticipateHistory data={null} />);
  expect(screen.getByRole("heading", { name: "History temporarily unavailable" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(navigation.refresh).toHaveBeenCalledOnce();
});
