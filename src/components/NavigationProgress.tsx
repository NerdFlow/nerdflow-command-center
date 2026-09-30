"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type NavPendingContextValue = {
  pendingHref: string | null;
  isNavigating: boolean;
};

const NavPendingContext = createContext<NavPendingContextValue>({ pendingHref: null, isNavigating: false });

export function useNavPending() {
  return useContext(NavPendingContext);
}

/**
 * Instant feedback when clicking any in-app link. Without this, App Router waits
 * for the full server render and the UI looks frozen for seconds.
 */
function showNavBar() {
  document.documentElement.dataset.nav = "1";
}

function hideNavBar() {
  delete document.documentElement.dataset.nav;
}

export function NavigationProgress({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const targetKey = useRef<string | null>(null);

  const clear = useCallback(() => {
    targetKey.current = null;
    hideNavBar();
    setPendingHref(null);
  }, []);

  useEffect(() => {
    clear();
  }, [pathname, clear]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;

      const hrefAttr = anchor.getAttribute("href");
      if (!hrefAttr || hrefAttr.startsWith("#")) return;
      if (anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      if (/^(https?:|mailto:|tel:)/i.test(hrefAttr) && !hrefAttr.startsWith(window.location.origin)) return;

      let url: URL;
      try {
        url = new URL(hrefAttr, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const nextPath = url.pathname;
      const nextKey = url.pathname + url.search;
      const currentKey = window.location.pathname + window.location.search;
      if (nextKey === currentKey) return;

      targetKey.current = nextKey;
      showNavBar();
      setPendingHref(nextPath);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Safety: if navigation stalls (error / aborted), don't leave the bar forever.
  useEffect(() => {
    if (!pendingHref) return;
    const t = window.setTimeout(clear, 12_000);
    return () => window.clearTimeout(t);
  }, [pendingHref, clear]);

  const isNavigating = Boolean(pendingHref);

  return (
    <NavPendingContext.Provider value={{ pendingHref, isNavigating }}>
      {children}
    </NavPendingContext.Provider>
  );
}
