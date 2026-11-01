import { fireEvent, render, screen } from "@testing-library/react";
import { WorkspaceCommunitySwitcher } from "@/components/workspace-community-switcher";

const orchard = { id: "orchard", name: "Orchard Collective", slug: "orchard-collective" };
const river = { id: "river / commons", name: "River Commons", slug: "river-commons" };

function openSwitcher() {
  const trigger = screen.getByRole("button", { name: "Community / DAO Orchard Collective" });
  fireEvent.click(trigger);
  return trigger;
}

describe("Community switcher", () => {
  it("opens an accessible dialog, focuses search, and exposes only supplied communities", () => {
    render(<WorkspaceCommunitySwitcher community={orchard} communities={[orchard, river]} />);
    const trigger = openSwitcher();
    const dialog = screen.getByRole("dialog", { name: "Choose a community / DAO" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", dialog.id);
    expect(screen.getByRole("searchbox", { name: "Search communities" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("2 communities available");
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /Orchard Collective/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /River Commons/ })).toHaveAttribute("href", "/communities/river%20%2F%20commons");
    expect(screen.getByRole("link", { name: /River Commons/ })).not.toHaveAttribute("aria-current");
  });

  it("searches names and slugs without changing the supplied community count", () => {
    render(<WorkspaceCommunitySwitcher community={orchard} communities={[orchard, river]} />);
    openSwitcher();
    const search = screen.getByRole("searchbox", { name: "Search communities" });
    fireEvent.change(search, { target: { value: " RIVER-COMMONS " } });
    expect(screen.getByRole("link", { name: /River Commons/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Orchard Collective/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 of 2 communities available");
    fireEvent.change(search, { target: { value: "Unavailable DAO" } });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("No communities match your search. Try another name.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 of 2 communities available");
  });

  it("dismisses the selector when following a community link", () => {
    render(<WorkspaceCommunitySwitcher community={orchard} communities={[orchard, river]} />);
    const trigger = openSwitcher();
    const destination = screen.getByRole("link", { name: /River Commons/ });
    // Keep the test in jsdom while preserving the real link destination and click handler.
    destination.addEventListener("click", event => event.preventDefault(), { once: true });
    fireEvent.click(destination);
    expect(destination).toHaveAttribute("href", "/communities/river%20%2F%20commons");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes with Escape, restores trigger focus, and clears the previous query when reopened", () => {
    render(<WorkspaceCommunitySwitcher community={orchard} communities={[orchard, river]} />);
    const trigger = openSwitcher();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "River" } });
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("dismisses on outside pointer interaction without pulling focus from the outside control", () => {
    render(<><WorkspaceCommunitySwitcher community={orchard} communities={[orchard]} /><button>Outside control</button></>);
    openSwitcher();
    const outside = screen.getByRole("button", { name: "Outside control" });
    fireEvent.pointerDown(outside);
    outside.focus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });

  it("allows normal keyboard focus to leave the nonmodal popover", () => {
    render(<><WorkspaceCommunitySwitcher community={orchard} communities={[orchard]} /><button>Next control</button></>);
    openSwitcher();
    const outside = screen.getByRole("button", { name: "Next control" });
    fireEvent.blur(screen.getByRole("searchbox"), { relatedTarget: outside });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes through the explicit close action and restores focus", () => {
    render(<WorkspaceCommunitySwitcher community={orchard} communities={[orchard]} />);
    const trigger = openSwitcher();
    fireEvent.click(screen.getByRole("button", { name: "Close community selector" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("does not add the current community when it is absent from the supplied accessible list", () => {
    render(<WorkspaceCommunitySwitcher community={orchard} communities={[]} />);
    openSwitcher();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 communities available");
    expect(screen.getByText("No communities are available to this account.")).toBeInTheDocument();
  });
});
