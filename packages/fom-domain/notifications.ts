import {
  ticketSchedule,
  isOverdueWork,
  type OverdueConfig,
} from "./ticket-dashboard";
import { hasTicketCompletionDocument } from "./work-completion";

export const NOTIFICATION_COLLECTIONS = {
  devices: "mobilePushDevices",
  events: "mobileNotifications",
  deliveries: "mobileNotificationDeliveries",
  heads: "mobileNotificationHeads",
  schedules: "mobileTicketNotificationSchedules",
} as const;
export const FOM_PUSH_PROJECT_ID = "c82f31bc-d850-42b4-83de-f8cb97ef868d";
export type NotificationKind =
  | "assigned"
  | "withdrawn"
  | "changed"
  | "reminder"
  | "daily_today"
  | "daily_overdue";
export type NotificationChange = "schedule" | "location" | "instructions";
export interface TicketNotification {
  id: string;
  uid: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  workId?: string;
  workIds?: string[];
  changes?: NotificationChange[];
}
export interface NotificationPage {
  items: TicketNotification[];
  unreadCount: number;
  cursor: string | null;
}
export type NotificationWork = Record<string, any>;
export type NotificationUser = {
  uid: string;
  displayName?: string;
  role?: string;
  disabled?: boolean;
};
export const normalizedText = (v: unknown) =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
export function scheduleKey(work: NotificationWork) {
  const s = ticketSchedule(work.dataInterventie);
  return s ? `${s.day}T${s.time}` : "";
}
export function locationKey(work: NotificationWork) {
  return JSON.stringify(
    [
      work.clientId,
      work.locationId,
      work.locationName,
      work.locatie,
      work.adresa,
      work.mobileContact?.address,
    ].map(normalizedText),
  );
}
export function activeNotificationWork(work: NotificationWork) {
  return (
    !work.anulat &&
    !work.anulatAt &&
    !work.archivedAt &&
    !work.archived &&
    !["anulată", "anulat", "arhivată", "arhivat"].includes(
      normalizedText(work.statusLucrare).toLocaleLowerCase("ro-RO"),
    ) &&
    !(
      work.preluatDispecer &&
      (hasTicketCompletionDocument(work) || work.statusLucrare === "Amânată")
    )
  );
}
export function reminderEligible(work: NotificationWork) {
  return (
    activeNotificationWork(work) &&
    !work.raportGenerat &&
    normalizedText(work.statusLucrare).toLocaleLowerCase("ro-RO") !==
      "finalizat"
  );
}
/** Mirrors the shared assignment union, but never resolves an ambiguous legacy name. */
export function notificationRecipients(
  work: NotificationWork | null,
  users: NotificationUser[],
) {
  if (!work) return [];
  const active = users.filter((u) => u.role === "tehnician" && !u.disabled);
  const names = new Map<string, NotificationUser[]>();
  for (const u of users.filter((u) => u.role === "tehnician")) {
    const n = u.displayName || "";
    names.set(n, [...(names.get(n) || []), u]);
  }
  const result = new Set<string>();
  for (const u of active)
    if (Array.isArray(work.technicianIds) && work.technicianIds.includes(u.uid))
      result.add(u.uid);
  for (const n of Array.isArray(work.tehnicieni) ? work.tehnicieni : []) {
    const matches = names.get(n) || [];
    if (matches.length === 1 && !matches[0].disabled)
      result.add(matches[0].uid);
  }
  return [...result].sort();
}
export function detectTicketNotifications(
  before: NotificationWork | null,
  after: NotificationWork | null,
  users: NotificationUser[],
) {
  const previous = notificationRecipients(before, users),
    next = notificationRecipients(after, users);
  const changes: NotificationChange[] = [];
  if (before && after) {
    if (scheduleKey(before) !== scheduleKey(after)) changes.push("schedule");
    if (locationKey(before) !== locationKey(after)) changes.push("location");
    if (
      normalizedText(after.descriere) &&
      normalizedText(before.descriere) !== normalizedText(after.descriere)
    )
      changes.push("instructions");
  }
  return [...new Set([...previous, ...next])].flatMap((uid) => {
    if (!next.includes(uid))
      return [
        {
          uid,
          kind: "withdrawn" as NotificationKind,
          changes: [] as NotificationChange[],
        },
      ];
    if (!previous.includes(uid))
      return [
        {
          uid,
          kind: "assigned" as NotificationKind,
          changes: [] as NotificationChange[],
        },
      ];
    return changes.length && after && activeNotificationWork(after)
      ? [{ uid, kind: "changed" as NotificationKind, changes }]
      : [];
  });
}
export function notificationCopy(
  kind: NotificationKind,
  changes: NotificationChange[] = [],
  count = 1,
) {
  switch (kind) {
    case "assigned":
      return {
        title: "Tichet atribuit",
        body: "Ți-a fost atribuit un tichet. Deschide FOM pentru detalii.",
      };
    case "withdrawn":
      return {
        title: "Tichet retras",
        body: "Un tichet nu îți mai este atribuit.",
      };
    case "changed":
      return {
        title: "Tichet actualizat",
        body: `Au fost actualizate: ${changes
          .map(
            (c) =>
              ({
                schedule: "Programul",
                location: "Locația",
                instructions: "Instrucțiunile",
              })[c],
          )
          .join(", ")
          .toLocaleLowerCase("ro-RO")}. Verifică tichetul în FOM.`,
      };
    case "reminder":
      return {
        title: "Intervenție în 30 de minute",
        body: "Ai o intervenție programată. Deschide FOM pentru detalii.",
      };
    case "daily_today":
      return {
        title: "Tichetele de azi",
        body: `Ai ${count} ${count === 1 ? "tichet programat" : "tichete programate"} azi, fără oră specificată.`,
      };
    case "daily_overdue":
      return {
        title: "Tichete restante",
        body: `Ai ${count} ${count === 1 ? "tichet restant" : "tichete restante"}. Verifică lista în FOM.`,
      };
  }
}
/** Convert a Romanian local calendar time without relying on the host timezone. */
export function scheduleInstant(work: NotificationWork): number | null {
  const s = ticketSchedule(work.dataInterventie);
  if (!s || s.time === "00:00:00") return null;
  const target = Date.parse(`${s.day}T${s.time}Z`);
  let utc = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Bucharest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const p = formatter.formatToParts(new Date(utc));
    const get = (key: string) => p.find((part) => part.type === key)!.value;
    const represented = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
    const offset = target - represented;
    if (!offset) return utc;
    utc += offset;
  }
  return null; // nonexistent local time during DST jump
}
export function dueReminder(work: NotificationWork, now: Date) {
  const scheduled = scheduleInstant(work);
  return (
    reminderEligible(work) &&
    scheduled !== null &&
    now.getTime() >= scheduled - 30 * 60000 &&
    now.getTime() < scheduled - 28 * 60000
  );
}
export function overdueReminder(
  work: NotificationWork,
  config: Partial<OverdueConfig>,
  now: Date,
) {
  return reminderEligible(work) && isOverdueWork(work as any, config, now);
}
export function notificationDestination(
  event: Pick<TicketNotification, "kind" | "workId">,
  attendance: boolean,
  assigned: boolean,
) {
  if (event.kind === "withdrawn" || (event.workId && !assigned && attendance))
    return "withdrawn";
  if (!attendance) return "attendance";
  return event.workId ? "ticket" : "dashboard";
}
