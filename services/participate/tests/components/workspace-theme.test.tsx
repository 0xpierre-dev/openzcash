import { fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceThemeControl, WorkspaceThemeProvider } from "@/components/workspace-theme";
import { parseWorkspaceThemePreference, workspaceThemeCookie, WORKSPACE_THEME_COOKIE } from "@/lib/domain/workspace-theme";

const cookieAccess = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookieAccess }));
import CommunitiesLayout from "@/app/communities/layout";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  cookieAccess.get.mockReset();
});

describe("Workspace theme preference", () => {
  it("accepts only explicit supported preferences and defaults malformed cookies to system", () => {
    expect(parseWorkspaceThemePreference("light")).toBe("light");
    expect(parseWorkspaceThemePreference("dark")).toBe("dark");
    expect(parseWorkspaceThemePreference("system")).toBe("system");
    for (const value of [undefined, null, "", "LIGHT", " dark ", "dark; Path=/", "unknown", {}, 1]) {
      expect(parseWorkspaceThemePreference(value)).toBe("system");
    }
  });

  it("shares the theme with authentication pages while bounding its lifetime and adds Secure for HTTPS", () => {
    expect(workspaceThemeCookie("dark", false)).toBe("workspace-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(workspaceThemeCookie("system", true)).toBe("workspace-theme=system; Path=/; Max-Age=31536000; SameSite=Lax; Secure");
  });

  it("renders the server cookie preference into the initial markup", async () => {
    cookieAccess.get.mockReturnValue({ value: "dark" });
    const markup = renderToStaticMarkup(await CommunitiesLayout({ children: <WorkspaceThemeControl /> }));
    expect(cookieAccess.get).toHaveBeenCalledWith(WORKSPACE_THEME_COOKIE);
    expect(markup).toContain('class="dao-theme-root" data-theme="dark"');
    expect(markup).toContain('aria-label="Toggle light and dark mode"');
    expect(markup).not.toContain("<select");
  });

  it("renders system preference when the server cookie is invalid", async () => {
    cookieAccess.get.mockReturnValue({ value: "invalid-theme" });
    const markup = renderToStaticMarkup(await CommunitiesLayout({ children: <p>Community workspace</p> }));
    expect(markup).toContain('data-theme="system"');
    expect(markup).not.toContain("invalid-theme");
  });
});

function mockSystemColorScheme(dark: boolean) {
  const matchMedia = vi.fn().mockReturnValue({
    matches: dark,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  });
  vi.stubGlobal("matchMedia", matchMedia);
  return matchMedia;
}

const toggleName = "Toggle light and dark mode";

describe("Workspace appearance control", () => {
  it("toggles explicit light and dark preferences and persists the appearance across community and authentication pages", () => {
    mockSystemColorScheme(true);
    const setCookie = vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => undefined);
    const { container } = render(<WorkspaceThemeProvider initialPreference="light"><WorkspaceThemeControl /></WorkspaceThemeProvider>);
    expect(setCookie).toHaveBeenCalledWith("workspace-theme=; Path=/communities; Max-Age=0; SameSite=Lax");
    const control = screen.getByRole("button", { name: toggleName });
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(control);
    expect(container.firstElementChild).toHaveAttribute("data-theme", "dark");
    expect(setCookie).toHaveBeenLastCalledWith("workspace-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax");
    expect(document.documentElement).not.toHaveAttribute("data-theme");
    fireEvent.click(control);
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");
    expect(setCookie).toHaveBeenLastCalledWith("workspace-theme=light; Path=/; Max-Age=31536000; SameSite=Lax");
  });

  it.each([
    { systemDark: false, expectedPreference: "dark" },
    { systemDark: true, expectedPreference: "light" }
  ])("selects $expectedPreference on the first click when system dark is $systemDark", ({ systemDark, expectedPreference }) => {
    const matchMedia = mockSystemColorScheme(systemDark);
    const setCookie = vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => undefined);
    const { container } = render(<WorkspaceThemeProvider><WorkspaceThemeControl /></WorkspaceThemeProvider>);
    expect(container.firstElementChild).toHaveAttribute("data-theme", "system");
    expect(matchMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: toggleName }));
    expect(matchMedia).toHaveBeenCalledWith("(prefers-color-scheme: dark)");
    expect(container.firstElementChild).toHaveAttribute("data-theme", expectedPreference);
    expect(setCookie).toHaveBeenLastCalledWith(`workspace-theme=${expectedPreference}; Path=/; Max-Age=31536000; SameSite=Lax`);
  });

  it("keeps the selected theme when navigating between children of the shared layout", () => {
    vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => undefined);
    const view = render(<WorkspaceThemeProvider initialPreference="light"><WorkspaceThemeControl /><h1>Community overview</h1></WorkspaceThemeProvider>);
    fireEvent.click(screen.getByRole("button", { name: toggleName }));
    view.rerender(<WorkspaceThemeProvider initialPreference="light"><WorkspaceThemeControl /><h1>Proposal discussion</h1></WorkspaceThemeProvider>);
    expect(screen.getByRole("heading", { name: "Proposal discussion" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: toggleName })).toBeInTheDocument();
    expect(view.container.firstElementChild).toHaveAttribute("data-theme", "dark");
  });

  it("still updates appearance when browser cookie storage is blocked", () => {
    vi.spyOn(Document.prototype, "cookie", "set").mockImplementation(() => { throw new DOMException("Storage blocked", "SecurityError"); });
    const { container } = render(<WorkspaceThemeProvider initialPreference="dark"><WorkspaceThemeControl /></WorkspaceThemeProvider>);
    expect(() => fireEvent.click(screen.getByRole("button", { name: toggleName }))).not.toThrow();
    expect(container.firstElementChild).toHaveAttribute("data-theme", "light");
  });

  it("can render in isolated workspace frames without a provider or a client-only scheme lookup", () => {
    const matchMedia = mockSystemColorScheme(true);
    render(<WorkspaceThemeControl />);
    expect(screen.getByRole("button", { name: toggleName })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(matchMedia).not.toHaveBeenCalled();
  });
});
