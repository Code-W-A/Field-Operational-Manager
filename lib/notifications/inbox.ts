import {
  activeNotificationWork,
  assigned,
  hasTicketCompletionDocument,
  notificationCopy,
  overdueReminder,
  reminderEligible,
  ticketSchedule,
  bucharestCalendar,
  type TicketNotification,
  type Actor,
  type RecordData,
} from "@/packages/fom-domain";
import type { OverdueConfig } from "@/packages/fom-domain/ticket-dashboard";

/** Current relevance is independent of whether the user has read the event. */
export function inboxEvent(
  event: TicketNotification,
  actor: Actor,
  works: Map<string, RecordData>,
  config: Partial<OverdueConfig>,
  now = new Date(),
): TicketNotification | null {
  const usable = (w: RecordData | undefined): w is RecordData =>
    !!w &&
    assigned(w, actor) &&
    activeNotificationWork(w) &&
    !hasTicketCompletionDocument(w) &&
    w.statusLucrare !== "Finalizat";
  if (event.kind === "withdrawn") return null;
  if (event.workId) {
    const work = works.get(event.workId);
    if (!usable(work)) return null;
    return {
      ...event,
      ...(work.nrLucrare ? { workNumber: String(work.nrLucrare) } : {}),
    };
  }
  if (!["daily_today", "daily_overdue"].includes(event.kind)) return null;
  const day = bucharestCalendar(now).day;
  if (bucharestCalendar(new Date(event.createdAt)).day !== day) return null;
  const workIds = (event.workIds || []).filter((id) => {
    const work = works.get(id);
    if (!usable(work) || !reminderEligible(work)) return false;
    if (event.kind === "daily_overdue")
      return overdueReminder(work, config, now);
    const schedule = ticketSchedule(work.dataInterventie);
    return schedule?.day === day && schedule.time === "00:00:00";
  });
  return workIds.length
    ? { ...event, workIds, ...notificationCopy(event.kind, [], workIds.length) }
    : null;
}

/** Only the latest assignment represents the current assignment, even when dismissed.
 * Keep updates/reminders separate: they carry different actionable information.
 */
export function currentAssignmentEvents<T extends TicketNotification>(
  events: T[],
): T[] {
  const latest = new Map<string, T>();
  for (const event of events) {
    if (!event.workId || !["assigned", "withdrawn"].includes(event.kind))
      continue;
    const key = `${event.uid}:${event.workId}`;
    const previous = latest.get(key);
    if (
      !previous ||
      Date.parse(event.createdAt) > Date.parse(previous.createdAt) ||
      (Date.parse(event.createdAt) === Date.parse(previous.createdAt) &&
        event.id > previous.id)
    )
      latest.set(key, event);
  }
  return events.filter(
    (event) =>
      event.kind !== "assigned" ||
      !event.workId ||
      latest.get(`${event.uid}:${event.workId}`)?.id === event.id,
  );
}
