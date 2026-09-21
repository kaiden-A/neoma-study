"use client";

import { OverlayProvider } from "@/components/ui/Overlays";

export function Providers({ children }: { children: React.ReactNode }) {
  return <OverlayProvider>{children}</OverlayProvider>;
}
