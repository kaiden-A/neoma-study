import type { Metadata } from "next";

import { StoreProvider } from "@/lib/store";
import { AssistantProvider } from "@/lib/assistant";
import { AppShell } from "@/components/AppShell";

// Everything behind the session cookie is for the person using it, never for
// a search index. robots.txt already blocks these paths; this is the belt.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <AssistantProvider>
        <AppShell>{children}</AppShell>
      </AssistantProvider>
    </StoreProvider>
  );
}
