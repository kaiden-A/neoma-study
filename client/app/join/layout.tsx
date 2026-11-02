import type { Metadata } from "next";

import { StoreProvider } from "@/lib/store";

// The join preview is public: the store is here for the signed-in check and
// the join action, without the app shell around it.
export const metadata: Metadata = {
  title: "Join a group",
  robots: { index: false, follow: false },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
