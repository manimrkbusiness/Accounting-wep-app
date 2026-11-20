import { addDays, formatDate } from "./format";
import type { Farmer, HarvestingEntry, TraderSettings } from "./types";

export type ReminderStatus = "overdue" | "due" | "soon" | "upcoming" | "none";

export type HarvestReminder = {
  farmer: Farmer;
  /** Date of the farmer's most recent recorded harvest, or null if none. */
  lastHarvest: string | null;
  /** Whole days since that last harvest. */
  daysSince: number | null;
  /** Effective cycle length in days (per-farmer override, else the trader default). */
  intervalDays: number;
  /** lastHarvest + intervalDays; null when the farmer has never been harvested. */
  dueDate: string | null;
  /** Signed days from today to the due date (negative = overdue). */
  daysUntilDue: number | null;
  status: ReminderStatus;
};

export const DEFAULT_HARVEST_DAYS = 45;
/** How many days before the due date a farmer begins to show as needing a reminder. */
export const REMINDER_LEAD_DAYS = 3;

const DAY_MS = 86400000;
function diffDays(fromDate: string, toDate: string) {
  return Math.round((new Date(`${toDate}T00:00:00`).getTime() - new Date(`${fromDate}T00:00:00`).getTime()) / DAY_MS);
}

export function reminderInterval(farmer: Farmer, settings: TraderSettings | null): number {
  if (farmer.harvest_interval_days && farmer.harvest_interval_days > 0) return farmer.harvest_interval_days;
  if (settings?.harvest_reminder_days && settings.harvest_reminder_days > 0) return settings.harvest_reminder_days;
  return DEFAULT_HARVEST_DAYS;
}

/** One reminder row per farmer, soonest-due first; farmers never harvested sort last. */
export function harvestReminders(farmers: Farmer[], entries: HarvestingEntry[], settings: TraderSettings | null, todayStr: string): HarvestReminder[] {
  const lastByFarmer = new Map<number, string>();
  entries.forEach((entry) => {
    if (entry.farmer_id == null) return;
    const prev = lastByFarmer.get(entry.farmer_id);
    if (!prev || entry.harvest_date > prev) lastByFarmer.set(entry.farmer_id, entry.harvest_date);
  });

  const list = farmers.map((farmer): HarvestReminder => {
    const intervalDays = reminderInterval(farmer, settings);
    const lastHarvest = lastByFarmer.get(farmer.id) ?? null;
    if (!lastHarvest) return { farmer, lastHarvest: null, daysSince: null, intervalDays, dueDate: null, daysUntilDue: null, status: "none" };
    const dueDate = addDays(lastHarvest, intervalDays);
    const daysSince = diffDays(lastHarvest, todayStr);
    const daysUntilDue = diffDays(todayStr, dueDate);
    const status: ReminderStatus = daysUntilDue < 0 ? "overdue" : daysUntilDue === 0 ? "due" : daysUntilDue <= REMINDER_LEAD_DAYS ? "soon" : "upcoming";
    return { farmer, lastHarvest, daysSince, intervalDays, dueDate, daysUntilDue, status };
  });

  return list.sort((a, b) => {
    if (a.daysUntilDue == null && b.daysUntilDue == null) return a.farmer.name.localeCompare(b.farmer.name);
    if (a.daysUntilDue == null) return 1;
    if (b.daysUntilDue == null) return -1;
    return a.daysUntilDue - b.daysUntilDue;
  });
}

/** Farmers that need a reminder now: overdue, or due within the lead window (3 days). */
export function dueReminders(reminders: HarvestReminder[]): HarvestReminder[] {
  return reminders.filter((reminder) => reminder.daysUntilDue != null && reminder.daysUntilDue <= REMINDER_LEAD_DAYS);
}

/** Short human label for a reminder's due state, e.g. "Overdue 3 days", "Due today", "in 5 days". */
export function dueLabel(reminder: HarvestReminder): string {
  if (reminder.daysUntilDue == null) return "No harvest recorded";
  if (reminder.daysUntilDue < 0) return `Overdue ${Math.abs(reminder.daysUntilDue)} day${Math.abs(reminder.daysUntilDue) === 1 ? "" : "s"}`;
  if (reminder.daysUntilDue === 0) return "Due today";
  return `in ${reminder.daysUntilDue} day${reminder.daysUntilDue === 1 ? "" : "s"}`;
}

/** The WhatsApp reminder text sent to a farmer. */
export function harvestReminderText(reminder: HarvestReminder, traderName?: string | null): string {
  const lines: string[] = [];
  lines.push("*BizzTrack — Harvest reminder*");
  if (traderName) lines.push(traderName);
  lines.push("");
  lines.push(`Hello ${reminder.farmer.name},`);
  if (reminder.lastHarvest) lines.push(`Your last coconut harvest with us was on ${formatDate(reminder.lastHarvest)} (${reminder.daysSince} days ago).`);
  lines.push(`We usually harvest about every ${reminder.intervalDays} days, so the next harvest is ${reminder.dueDate ? `due around ${formatDate(reminder.dueDate)}` : "due"}.`);
  lines.push("Shall we schedule the harvest? Please let us know a day that suits you.");
  return lines.join("\n");
}
