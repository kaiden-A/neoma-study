import { StoreProvider } from "@/lib/store";
import { AssistantProvider } from "@/lib/assistant";
import { AppShell } from "@/components/AppShell";
import { AssistantDock } from "@/components/assistant/AssistantDock";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider>
      <AssistantProvider>
        <AppShell>{children}</AppShell>
        <AssistantDock />
      </AssistantProvider>
    </StoreProvider>
  );
}
