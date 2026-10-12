/** Shared, read-only dashboard classification. Never writes a work status. */
export const OVERDUE_DEFAULTS = {
  intarziateEnabled: true,
  intarziateRequireExecDate: true,
  intarziateIncludePastDays: true,
  intarziateIncludeToday: true,
  intarziateTodayRequiresAfter18: true,
  intarziateRequireAssigned: true,
  intarziateRequireNotScanned: true,
};
export type OverdueConfig = typeof OVERDUE_DEFAULTS;
export const OVERDUE_SETTING_IDS: Record<keyof OverdueConfig, string> = {
  intarziateEnabled: "dashboard_intarziate_enabled",
  intarziateRequireExecDate: "dashboard_intarziate_require_exec_date",
  intarziateIncludePastDays: "dashboard_intarziate_include_past_days",
  intarziateIncludeToday: "dashboard_intarziate_include_today",
  intarziateTodayRequiresAfter18: "dashboard_intarziate_include_today_after_18",
  intarziateRequireAssigned: "dashboard_intarziate_require_assigned",
  intarziateRequireNotScanned: "dashboard_intarziate_require_not_scanned",
};
export function overdueConfigFromSettings(
  settings: { id: string; value?: unknown }[],
): OverdueConfig {
  const result = { ...OVERDUE_DEFAULTS };
  for (const key of Object.keys(result) as (keyof OverdueConfig)[]) {
    const setting = settings.find((s) => s.id === OVERDUE_SETTING_IDS[key]);
    if (setting) result[key] = Boolean(setting.value);
  }
  return result;
}
const clock = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Bucharest",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function bucharestCalendar(date: Date) {
  const parts = clock.formatToParts(date);
  const p = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    day: `${p("year")}-${p("month")}-${p("day")}`,
    time: `${p("hour")}:${p("minute")}:${p("second")}`,
  };
}
function validDay(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    y >= 1000 &&
    y <= 9999 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
export function ticketSchedule(
  value: unknown,
): { day: string; time: string } | null {
  if (value instanceof Date)
    return Number.isFinite(value.getTime()) ? bucharestCalendar(value) : null;
  if (typeof value === "number") return ticketSchedule(new Date(value));
  if (value && typeof value === "object") {
    const stamp = value as {
      toDate?: () => Date;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof stamp.toDate === "function")
      return ticketSchedule(stamp.toDate());
    if (typeof stamp.seconds === "number")
      return ticketSchedule(
        stamp.seconds * 1000 + (stamp.nanoseconds || 0) / 1e6,
      );
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  const ro =
    /^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      text,
    );
  const iso =
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/.exec(
      text,
    );
  if (!ro && !iso) return null;
  const match = (ro || iso)!;
  const y = Number(ro ? match[3] : match[1]),
    m = Number(match[2]),
    d = Number(ro ? match[1] : match[3]);
  if (
    !validDay(y, m, d) ||
    Number(match[4] || 0) > 23 ||
    Number(match[5] || 0) > 59 ||
    Number(match[6] || 0) > 59
  )
    return null;
  if (iso?.[7]) return ticketSchedule(new Date(text.replace(" ", "T")));
  return {
    day: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    time: `${match[4] || "00"}:${match[5] || "00"}:${match[6] || "00"}`,
  };
}
export type DashboardWork = {
  id: string;
  dataInterventie?: unknown;
  statusLucrare?: unknown;
  equipmentVerified?: unknown;
  preluatDispecer?: unknown;
  tehnicieni?: unknown;
  technicianIds?: unknown;
  raportGenerat?: unknown;
  anulat?: unknown;
  anulatAt?: unknown;
  motivAnulare?: unknown;
};
function isDashboardCanceled(work: Omit<DashboardWork, "id">) {
  return (
    work.anulat === true ||
    !!work.anulatAt ||
    !!String(work.motivAnulare || "").trim() ||
    ["anulată", "anulat", "arhivată"].includes(
      String(work.statusLucrare).toLocaleLowerCase("ro-RO"),
    )
  );
}
export function isOverdueWork(
  work: Omit<DashboardWork, "id">,
  config: Partial<OverdueConfig> = {},
  now = new Date(),
): boolean {
  const cfg = { ...OVERDUE_DEFAULTS, ...config };
  if (!cfg.intarziateEnabled || isDashboardCanceled(work)) return false;
  const scheduled = ticketSchedule(work.dataInterventie);
  // Next.js also excludes a missing date when requireExecDate is false.
  if (!scheduled) return false;
  const today = bucharestCalendar(now);
  const dateCondition =
    scheduled.day < today.day
      ? cfg.intarziateIncludePastDays
      : scheduled.day === today.day &&
        cfg.intarziateIncludeToday &&
        (!cfg.intarziateTodayRequiresAfter18 || today.time >= "18:00:00");
  const assigned =
    (Array.isArray(work.tehnicieni) && work.tehnicieni.length > 0) ||
    (Array.isArray(work.technicianIds) && work.technicianIds.length > 0) ||
    String(work.statusLucrare).toLocaleLowerCase("ro-RO") === "atribuită";
  return (
    !!dateCondition &&
    (!cfg.intarziateRequireAssigned || assigned) &&
    (!cfg.intarziateRequireNotScanned || !work.equipmentVerified) &&
    !work.preluatDispecer
  );
}
export type DashboardGroup = "current" | "overdue" | "future";
export type DashboardEntry<T> = { work: T; note?: string };
export function groupDashboardTickets<T extends DashboardWork>(
  works: T[],
  config: Partial<OverdueConfig> = {},
  now = new Date(),
): Record<DashboardGroup, DashboardEntry<T>[]> {
  const groups: Record<DashboardGroup, DashboardEntry<T>[]> = {
    current: [],
    overdue: [],
    future: [],
  };
  const today = bucharestCalendar(now).day;
  const unique = new Map(works.map((work) => [work.id, work]));
  const schedules = new Map(
    [...unique.values()].map((work) => [
      work.id,
      ticketSchedule(work.dataInterventie),
    ]),
  );
  for (const work of unique.values()) {
    if (
      isDashboardCanceled(work) ||
      (work.preluatDispecer &&
        (work.raportGenerat || work.statusLucrare === "Amânată"))
    )
      continue;
    const scheduled = schedules.get(work.id);
    const finalized =
      work.raportGenerat === true || work.statusLucrare === "Finalizat";
    if (finalized)
      groups.current.push({
        work,
        note: "Raport finalizat · Disponibil pentru consultare",
      });
    else if (isOverdueWork(work, config, now)) groups.overdue.push({ work });
    else if (scheduled && scheduled.day > today) groups.future.push({ work });
    else
      groups.current.push({
        work,
        note: !scheduled
          ? "Fără dată programată"
          : scheduled.day < today
            ? "În lucru dintr-o zi anterioară"
            : undefined,
      });
  }
  for (const entries of Object.values(groups))
    entries.sort((a, b) => {
      const da = schedules.get(a.work.id),
        db = schedules.get(b.work.id);
      if (!da || !db)
        return da ? -1 : db ? 1 : a.work.id.localeCompare(b.work.id);
      const sa = da.day + "T" + da.time,
        sb = db.day + "T" + db.time;
      return sa.localeCompare(sb) || a.work.id.localeCompare(b.work.id);
    });
  return groups;
}
/** Poll only while active, at most once per minute; hit 18:00/midnight exactly. */
export function dashboardRefreshDelay(now: Date): number {
  const time = bucharestCalendar(now).time.split(":").map(Number);
  const seconds = time[0] * 3600 + time[1] * 60 + time[2];
  const boundary = seconds < 18 * 3600 ? 18 * 3600 : 24 * 3600;
  return Math.max(
    1,
    Math.min(60000, (boundary - seconds) * 1000 - now.getMilliseconds()),
  );
}
