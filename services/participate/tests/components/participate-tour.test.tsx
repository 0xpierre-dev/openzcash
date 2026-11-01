import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ParticipateTour } from "@/components/participate-tour";

const key = "participate-quick-tour-v1";
const originalShowModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const originalClose = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
beforeEach(() => {
  for (const name of ["localStorage", "sessionStorage"]) {
    const values = new Map<string, string>();
    vi.stubGlobal(name, { getItem: (item: string) => values.get(item) ?? null, setItem: (item: string, value: string) => values.set(item, value) });
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
afterAll(() => {
  if (originalShowModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", originalShowModal);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (originalClose) Object.defineProperty(HTMLDialogElement.prototype, "close", originalClose);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function Preview({ signedIn = true, filters = true, discussion = true }: { signedIn?: boolean; filters?: boolean; discussion?: boolean }) {
  return <StrictMode><div>
    <div data-participate-tour="account"><button>{signedIn ? "Account settings" : "Sign in"}</button></div>
    {filters ? <div data-participate-tour="filters"><button>All</button></div> : null}
    {discussion ? <div data-participate-tour="discussion"><button>Comments</button><button>Read & verify</button></div> : null}
    <ParticipateTour signedIn={signedIn} canUseCredits={signedIn} />
  </div></StrictMode>;
}

it("walks through visible controls and returns focus to the profile after finishing", () => {
  render(<Preview />);
  expect(screen.getByRole("dialog", { name: "Find a proposal" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Find a proposal" })).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByRole("dialog", { name: "Read, verify, discuss" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByRole("dialog", { name: "Find a proposal" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("Profile → Credits")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Account settings" })).toHaveFocus();
  expect(document.body.style.overflow).toBe("");
});

it.each(["skip", "escape", "reload", "finish"])("shows only on the first visit after %s", action => {
  const view = render(<Preview />);
  if (action === "skip") fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  if (action === "escape") fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  if (action === "finish") {
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  }
  if (action !== "reload") expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(localStorage.getItem(key)).toBe("seen");
  view.unmount();
  render(<Preview />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("explains sign-in to guests and omits controls absent from an empty board", () => {
  render(<Preview signedIn={false} filters={false} discussion={false} />);
  expect(screen.getByRole("dialog", { name: "Join when you’re ready" })).toHaveTextContent("Sign in here to participate");
  expect(screen.getByText(/1 of 1/)).toBeInTheDocument();
  expect(screen.queryByText("Profile → Credits")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Got it" }));
  expect(screen.getByRole("button", { name: "Sign in" })).toHaveFocus();
});

it("uses session storage when persistent storage is unavailable", () => {
  vi.stubGlobal("localStorage", { getItem() { throw new Error("restricted"); }, setItem() { throw new Error("restricted"); } });
  const view = render(<Preview />);
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(sessionStorage.getItem(key)).toBe("seen");
  view.unmount(); render(<Preview />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("remains dismissible when all browser storage is blocked", () => {
  const blocked = { getItem() { throw new Error("restricted"); }, setItem() { throw new Error("restricted"); } };
  vi.stubGlobal("localStorage", blocked); vi.stubGlobal("sessionStorage", blocked);
  render(<Preview />);
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe("");
});
