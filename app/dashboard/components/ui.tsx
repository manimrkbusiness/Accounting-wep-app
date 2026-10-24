"use client";

import type { LucideIcon } from "lucide-react";
import type { DateRange } from "../lib/calc";
import { addDays, startOfMonth, today } from "../lib/format";

export function Panel({ eyebrow, title, action, children, className = "" }: { eyebrow?: string; title: string; action?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <section className={`tool-panel ${className}`.trim()}>
      <div className="panel-heading"><div>{eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}<h2>{title}</h2></div>{action}</div>
      {children}
    </section>
  );
}

export function Metric({ label, value, hint, icon: Icon, tone }: { label: string; value: string; hint?: string; icon: LucideIcon; tone?: "positive" | "negative" }) {
  return (
    <article className={tone ? `metric-${tone}` : undefined}>
      <div className="metric-head"><span className="metric-icon"><Icon size={18} strokeWidth={2.2} aria-hidden="true" /></span><span>{label}</span></div>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status}`}>{status.replace("_", " ")}</span>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="empty-state">{children}</p>;
}

export type PeriodPreset = "all" | "month" | "30" | "custom";

export function periodToRange(preset: PeriodPreset, from: string, to: string): DateRange {
  const now = today();
  if (preset === "all") return null;
  if (preset === "month") return { from: startOfMonth(now), to: now };
  if (preset === "30") return { from: addDays(now, -29), to: now };
  return from && to ? { from, to } : null;
}

export function PeriodPicker({ preset, from, to, onChange }: { preset: PeriodPreset; from: string; to: string; onChange: (next: { preset: PeriodPreset; from: string; to: string }) => void }) {
  return (
    <div className="filter-bar">
      <label>Period<select value={preset} onChange={(event) => onChange({ preset: event.target.value as PeriodPreset, from, to })}><option value="all">All time</option><option value="month">This month</option><option value="30">Last 30 days</option><option value="custom">Custom dates</option></select></label>
      {preset === "custom" ? <>
        <label>From<input type="date" value={from} onChange={(event) => onChange({ preset, from: event.target.value, to })} /></label>
        <label>To<input type="date" value={to} onChange={(event) => onChange({ preset, from, to: event.target.value })} /></label>
      </> : null}
    </div>
  );
}

export function KeyValueList({ rows }: { rows: Array<{ label: string; value: string; tone?: "credit" | "debit" | "total"; hint?: string }> }) {
  return (
    <dl className="kv-list">
      {rows.map((row) => <div className={row.tone ? `kv-${row.tone}` : undefined} key={row.label}><dt>{row.label}{row.hint ? <small>{row.hint}</small> : null}</dt><dd>{row.value}</dd></div>)}
    </dl>
  );
}
