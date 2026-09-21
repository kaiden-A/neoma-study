import { StoreProvider } from "@/lib/store";

// The join preview is public: the store is here for the signed-in check and
// the join action, without the app shell around it.
export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
