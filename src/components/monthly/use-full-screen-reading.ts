"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import {
  PHONE_QUERY,
  fullScreenLayout,
  fullScreenMessage,
  readingFraction,
  swipeTurn,
  tabStop,
  tapZone,
  turnedPage,
  type PageTurn,
} from "@/lib/monthly/full-screen";
import { pageFromHash } from "@/lib/monthly/reader";

const CONTROLS_REST_MS = 3000;
// Long enough to take the second tap of a double tap on the close button.
const EXIT_SHIELD_MS = 400;
const FOCUSABLE = "a[href], button:not(:disabled)";
// A pinched page pans under the finger instead of turning.
const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;

// The reader never scrolls behind the open page. The previous inline values
// and position come back exactly as they were.
function lockPageScroll() {
  const targets = [document.documentElement, document.body];
  const before = targets.map((element) => element.style.overflow);
  const { scrollX, scrollY } = window;
  targets.forEach((element) => {
    element.style.overflow = "hidden";
  });
  return () => {
    targets.forEach((element, i) => {
      element.style.overflow = before[i];
    });
    window.scrollTo(scrollX, scrollY);
  };
}

// Everything outside the open page is inert, for screen readers that do not
// honour aria-modal on an overlay.
function setAsideTheRest(element: HTMLElement) {
  const others: HTMLElement[] = [];
  for (
    let node: HTMLElement | null = element;
    node && node !== document.body;
    node = node.parentElement
  )
    for (const sibling of node.parentElement?.children ?? [])
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.inert)
        others.push(sibling);
  others.forEach((other) => {
    other.inert = true;
  });
  return () =>
    others.forEach((other) => {
      other.inert = false;
    });
}

// Browsers with the Fullscreen API also hide their own bars. A refused or
// missing request keeps the overlay, which already fills the screen.
function requestBrowserFullScreen(
  element: HTMLElement,
  stillOpen: () => boolean,
) {
  if (
    typeof element.requestFullscreen !== "function" ||
    document.fullscreenElement === element
  )
    return;
  const leaveIfClosed = () => {
    if (!stillOpen() && document.fullscreenElement === element)
      void document.exitFullscreen().catch(() => {});
  };
  try {
    void Promise.resolve(
      element.requestFullscreen({ navigationUI: "hide" }),
    ).then(leaveIfClosed, () => {});
  } catch {
    /* Same overlay without the browser's help. */
  }
}

// Leaving the browser's full screen (system gesture, Esc) leaves the mode.
function followBrowserFullScreen(element: HTMLElement, exit: () => void) {
  let entered = document.fullscreenElement === element;
  const onChange = () => {
    if (document.fullscreenElement === element) entered = true;
    else if (entered) exit();
  };
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

type Size = { width: number; height: number };

// The overlay box is the screen: bars, rotation and browser full screen all
// resize it. A pinch does not, and is reported on its own.
function watchScreen(
  element: HTMLElement,
  onSize: (size: Size) => void,
  onPinch: () => void,
) {
  const measure = () =>
    onSize({ width: element.clientWidth, height: element.clientHeight });
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  window.addEventListener("resize", measure);
  window.visualViewport?.addEventListener("resize", onPinch);
  return () => {
    observer.disconnect();
    window.removeEventListener("resize", measure);
    window.visualViewport?.removeEventListener("resize", onPinch);
  };
}

// Focus returns to the control that opened the page, once the browser has
// left its own full screen.
function returnFocus(
  back: HTMLElement | null,
  leaveBrowserFullScreen: boolean,
) {
  const restore = () => {
    if (back?.isConnected) back.focus({ preventScroll: true });
  };
  if (leaveBrowserFullScreen)
    void document.exitFullscreen().then(restore, restore);
  else restore();
}

// Esc leaves, Tab cycles through the controls and hot spots of the open page,
// and focus that lands behind the overlay comes back to its first control.
function keepKeyboardInside(
  element: HTMLElement,
  first: () => HTMLElement | null,
  onKey: () => void,
  exit: () => void,
) {
  const stops = () =>
    [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (item) => item.getClientRects().length > 0,
    );
  function onKeyDown(event: KeyboardEvent) {
    onKey();
    if (event.key === "Escape") {
      event.preventDefault();
      exit();
      return;
    }
    if (event.key !== "Tab" || event.altKey || event.metaKey || event.ctrlKey)
      return;
    const items = stops();
    const next = tabStop(
      items.length,
      items.indexOf(document.activeElement as HTMLElement),
      event.shiftKey,
    );
    event.preventDefault();
    if (next !== null) items[next].focus({ preventScroll: true });
  }
  function onFocusIn(event: FocusEvent) {
    if (event.target instanceof Node && !element.contains(event.target))
      (first() ?? stops()[0])?.focus({ preventScroll: true });
  }
  window.addEventListener("keydown", onKeyDown);
  document.addEventListener("focusin", onFocusIn);
  return () => {
    window.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("focusin", onFocusIn);
  };
}

// The controls rest after a few seconds without interaction. The swipe tip
// greets the reader on the way in and leaves with the first rest.
function useRestingControls() {
  const [resting, setResting] = useState(false);
  const [greeting, setGreeting] = useState(false);
  // Read by the tap that lands before the next render.
  const asleep = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rest = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    asleep.current = true;
    setResting(true);
    setGreeting(false);
  }, []);
  const wake = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    asleep.current = false;
    setResting(false);
    timer.current = setTimeout(rest, CONTROLS_REST_MS);
  }, [rest]);
  const greet = useCallback(() => {
    setGreeting(true);
    wake();
  }, [wake]);
  const hush = useCallback(() => setGreeting(false), []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { resting, greeting, asleep, wake, rest, greet, hush };
}

// A tap on the resting pager only brings the controls back, like a tap in the
// middle of the page. It is judged as the finger lands, because the focus that
// follows wakes the controls before the click. Keys act at once.
function useWakingPager(asleep: RefObject<boolean>, wake: () => void) {
  const wakingTap = useRef(false);
  return {
    onPointerDownCapture() {
      wakingTap.current = asleep.current;
    },
    onClickCapture(event: MouseEvent) {
      const waking = wakingTap.current && event.detail > 0;
      wakingTap.current = false;
      if (!waking) return;
      event.preventDefault();
      event.stopPropagation();
      wake();
    },
  };
}

// A second tap on the close button must not reach the control that was
// underneath it: for a moment after leaving, the page takes no taps.
function useExitShield() {
  const [shielded, setShielded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shield = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setShielded(true);
    timer.current = setTimeout(() => setShielded(false), EXIT_SHIELD_MS);
  }, []);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { shielded, shield };
}

type Gestures = {
  active: boolean;
  page: RefObject<HTMLElement | null>;
  rotated: boolean;
  onTurn: (turn: PageTurn) => void;
  onMiddle: () => void;
};

// Swipes are read on release so a link under the finger still opens on a tap;
// links and controls win over the three tap zones of the page.
function usePageGestures({
  active,
  page,
  rotated,
  onTurn,
  onMiddle,
}: Gestures) {
  const press = useRef<{ id: number; x: number; y: number } | null>(null);
  const swiped = useRef(false);
  if (!active) return {};
  return {
    onPointerDown(event: PointerEvent) {
      swiped.current = false;
      press.current = event.isPrimary
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : null;
    },
    onPointerUp(event: PointerEvent) {
      const start = press.current;
      press.current = null;
      if (!start || start.id !== event.pointerId || zoomed()) return;
      const turn = swipeTurn(
        event.clientX - start.x,
        event.clientY - start.y,
        rotated,
      );
      if (!turn) return;
      swiped.current = true;
      onTurn(turn);
    },
    onPointerCancel() {
      press.current = null;
    },
    // The click that ends a mouse swipe is not a tap.
    onClickCapture(event: MouseEvent) {
      if (!swiped.current) return;
      swiped.current = false;
      event.preventDefault();
      event.stopPropagation();
    },
    onClick(event: MouseEvent) {
      const box = page.current?.getBoundingClientRect();
      if (!box || (event.target as Element).closest("a, button, nav")) return;
      const zone = tapZone(
        readingFraction({ x: event.clientX, y: event.clientY }, box, rotated),
      );
      if (zone === "controls") onMiddle();
      else onTurn(zone);
    },
  };
}

type Options = {
  root: RefObject<HTMLElement | null>;
  page: RefObject<HTMLElement | null>;
  closeButton: RefObject<HTMLElement | null>;
  // Where focus returns when the page itself was tapped to open.
  fallbackOpener?: RefObject<HTMLElement | null>;
  // What the browser takes full screen. An element that outlives the reader
  // keeps the browser there when a publication is swapped under the open page.
  browserHost?: RefObject<HTMLElement | null>;
  pageNumber: number;
  pageCount: number;
  goTo: (page: number) => void;
  onChange?: (on: boolean) => void;
};

// Full screen reading for phones. It is a fixed overlay, so it works where the
// Fullscreen API does not exist (iPhone Safari); the layout is the same when
// the browser also goes full screen.
export function useFullScreenReading({
  root,
  page,
  closeButton,
  fallbackOpener,
  browserHost,
  pageNumber,
  pageCount,
  goTo,
  onChange,
}: Options) {
  const [active, setActive] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [pinched, setPinched] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const { resting, greeting, asleep, wake, rest, greet, hush } =
    useRestingControls();
  const { shielded, shield } = useExitShield();
  const opener = useRef<HTMLElement | null>(null);
  const live = useRef(false);
  const layout = fullScreenLayout(viewport.width, viewport.height);

  const exit = useCallback(() => {
    if (!live.current) return;
    live.current = false;
    setActive(false);
    setAnnouncement(fullScreenMessage(false));
    shield();
  }, [shield]);

  function enter(from?: HTMLElement | null) {
    const element = root.current;
    if (live.current || !element) return;
    const focused = document.activeElement;
    opener.current =
      from ??
      (focused instanceof HTMLElement && focused !== document.body
        ? focused
        : (fallbackOpener?.current ?? null));
    live.current = true;
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    setPinched(zoomed());
    setActive(true);
    // The address names the page even before a publication that was just
    // swapped in has read it.
    const page = window.location.hash
      ? pageFromHash(window.location.hash, pageCount)
      : pageNumber;
    setAnnouncement(fullScreenMessage(true, page, pageCount));
    greet();
    requestBrowserFullScreen(
      browserHost?.current ?? element,
      () => live.current,
    );
  }

  // The owner hears about the mode but not about an unmount, so a publication
  // swapped under an open page can open the same way.
  useEffect(() => {
    onChange?.(active);
  }, [active, onChange]);

  useEffect(() => {
    const element = root.current;
    if (!active || !element) return;
    const unlock = lockPageScroll();
    const release = setAsideTheRest(element);
    closeButton.current?.focus({ preventScroll: true });
    const unwatch = watchScreen(
      element,
      (size) =>
        setViewport((old) =>
          old.width === size.width && old.height === size.height ? old : size,
        ),
      () => setPinched(zoomed()),
    );
    const releaseKeyboard = keepKeyboardInside(
      element,
      () => closeButton.current,
      wake,
      exit,
    );
    const screen = browserHost?.current ?? element;
    const unfollow = followBrowserFullScreen(screen, exit);
    return () => {
      unwatch();
      releaseKeyboard();
      unfollow();
      // exit() has already run when the reader is leaving the mode; an
      // unmount leaves the browser's full screen to whatever takes over.
      const closing = !live.current;
      live.current = false;
      unlock();
      release();
      const back = opener.current;
      opener.current = null;
      returnFocus(back, closing && document.fullscreenElement === screen);
    };
  }, [active, root, closeButton, browserHost, exit, wake]);

  // Every turn brings the counter back for a moment; at either cover it
  // answers instead of the page.
  function turn(direction: PageTurn) {
    const next = turnedPage(pageNumber, pageCount, direction);
    if (next !== null) {
      goTo(next);
      hush();
    }
    wake();
  }

  const pager = useWakingPager(asleep, wake);

  const surface = usePageGestures({
    active,
    page,
    rotated: layout.rotated,
    onTurn: turn,
    onMiddle() {
      if (resting) wake();
      else rest();
    },
  });

  // On phones a tap on the page itself opens it in full screen.
  function onPageClick(event: MouseEvent) {
    if (
      active ||
      (event.target as Element).closest("a, button") ||
      !window.matchMedia(PHONE_QUERY).matches
    )
      return;
    enter();
  }

  const surfaceStyle: CSSProperties | undefined = active
    ? {
        width: layout.width,
        height: layout.height,
        transform: layout.rotated
          ? `translateX(${layout.height}px) rotate(90deg)`
          : undefined,
      }
    : undefined;

  return {
    active,
    rotated: layout.rotated,
    resting,
    greeting,
    shielded,
    pinched,
    announcement,
    surface,
    surfaceStyle,
    enter,
    exit,
    wake,
    turn,
    pager,
    onPageClick,
  };
}
