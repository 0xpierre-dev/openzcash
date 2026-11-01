import { fireEvent, render, screen } from "@testing-library/react";
import { ParticipateBridge, useParticipateHost } from "@/components/participate-bridge";

const theme = vi.hoisted(() => ({ preference: "light", setPreference: vi.fn() }));
vi.mock("@/components/workspace-theme", () => ({ useWorkspaceTheme: () => theme }));
const origin = "https://openzcash.org";
function Views() {
  const open = useParticipateHost();
  return <button disabled={!open} onClick={() => open?.("history")}>Decision history</button>;
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("keeps the host bridge inactive for standalone visits", () => {
  render(<ParticipateBridge parentOrigin={origin}><Views /></ParticipateBridge>);
  expect(screen.getByRole("button", { name: "Decision history" })).toBeDisabled();
});
it("uses fixed view messages and accepts appearance only from the configured parent", () => {
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal("parent", parent);
  render(<ParticipateBridge parentOrigin={origin}><Views /></ParticipateBridge>);
  expect(parent.postMessage).toHaveBeenCalledWith({ type: "participate:ready", version: 1 }, origin);
  fireEvent.click(screen.getByRole("button", { name: "Decision history" }));
  expect(parent.postMessage).toHaveBeenLastCalledWith({ type: "participate:view", version: 1, view: "history" }, origin);
  const data = { type: "participate:theme", version: 1, theme: "dark" };
  fireEvent(window, new MessageEvent("message", { origin: "https://untrusted.test", source: parent as unknown as Window, data }));
  fireEvent(window, new MessageEvent("message", { origin, source: window, data }));
  expect(theme.setPreference).not.toHaveBeenCalled();
  fireEvent(window, new MessageEvent("message", { origin, source: parent as unknown as Window, data }));
  expect(theme.setPreference).toHaveBeenCalledExactlyOnceWith("dark");
});
it("reports appearance so navigating workspace tabs can retain the selected theme", () => {
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal("parent", parent);
  const view = render(<ParticipateBridge parentOrigin={origin}><Views /></ParticipateBridge>);
  theme.preference = "dark";
  view.rerender(<ParticipateBridge parentOrigin={origin}><Views /></ParticipateBridge>);
  expect(parent.postMessage).toHaveBeenLastCalledWith({ type: "participate:theme", version: 1, theme: "dark" }, origin);
  theme.preference = "light";
});
