"use client";

import { WorkspaceProvider } from "./lib/workspace";
import { Shell } from "./components/Shell";

export default function VersionTwoLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <Shell>{children}</Shell>
    </WorkspaceProvider>
  );
}
