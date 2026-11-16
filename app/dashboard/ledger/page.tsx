"use client";

import { SalesHistory } from "../sales/page";

// Complete transaction ledger: every sale, coconut and husk together, with a Type filter to narrow it.
export default function LedgerPage() {
  return <SalesHistory heading="Complete transaction ledger" />;
}
