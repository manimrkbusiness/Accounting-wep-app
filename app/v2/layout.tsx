"use client";

import { WorkspaceProvider } from "./lib/workspace";
import { Shell } from "./components/Shell";
import { BillingGate } from "./components/BillingGate";

export default function VersionTwoLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>
        <BillingGate>{children}</BillingGate>
      </Shell>
    </WorkspaceProvider>
  );
}
