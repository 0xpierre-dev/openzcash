"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, type ReactNode } from "react";
import { PARTICIPATE_PATH } from "@/lib/participate/config";

/**
 * The workspace once ran inside an iframe and asked its host for fixed views
 * through postMessage. Rendered natively, the same requests become portal
 * navigation; "about" reopens the pilot introduction owned by the page.
 */
type HostView = "proposals" | "history" | "committee" | "about";
const ParticipateHost = createContext<((view: HostView) => void) | null>(null);
export const useParticipateHost = () => useContext(ParticipateHost);
export const PARTICIPATE_ABOUT_EVENT = "participate:about";

export function ParticipateBridge({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const openView = useCallback(
    (view: HostView) => {
      if (view === "about") {
        window.dispatchEvent(new Event(PARTICIPATE_ABOUT_EVENT));
        return;
      }
      const href =
        view === "proposals"
          ? PARTICIPATE_PATH
          : `${PARTICIPATE_PATH}?view=${view}`;
      router.push(href, { scroll: false });
      // A returning view must re-read the session, likes and balances on the server.
      router.refresh();
    },
    [router],
  );
  return (
    <ParticipateHost.Provider value={openView}>
      {children}
    </ParticipateHost.Provider>
  );
}
