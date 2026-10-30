import { StoreProvider } from "@/lib/store";
import { AssistantProvider } from "@/lib/assistant";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <AssistantProvider>
        <AppShell>{children}</AppShell>
      </AssistantProvider>
    </StoreProvider>
  );
}
