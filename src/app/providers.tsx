"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/Toast";
import { NavigationProgress } from "@/components/NavigationProgress";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <NavigationProgress>{children}</NavigationProgress>
      </ToastProvider>
    </SessionProvider>
  );
}
