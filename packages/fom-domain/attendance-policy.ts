import {
  attendanceTimeOnLocalDay,
  getAttendanceLocalDateParts,
} from "./attendance-timezone";
export function attendanceDay(at: number) {
  const p = getAttendanceLocalDateParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
export function attendanceSpecialDay(
  at: number,
  holidays: { date: string; label?: string }[] = [],
) {
  const date = attendanceDay(at),
    holiday = holidays.find((h) => h.date === date);
  if (holiday)
    return {
      kind: "legal_holiday" as const,
      label: holiday.label?.trim() || "Sărbătoare legală",
      date,
    };
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return day === 6
    ? { kind: "saturday" as const, label: "Sâmbătă", date }
    : day === 0
      ? { kind: "sunday" as const, label: "Duminică", date }
      : null;
}
export function attendanceScheduleTime(
  at: number,
  time: string | undefined,
  fallback: string,
) {
  const text = /^([01]\d|2[0-3]):[0-5]\d$/.test(time || "") ? time! : fallback;
  const [h, m] = text.split(":").map(Number);
  return attendanceTimeOnLocalDay(at, h, m);
}
export type AttendanceRouteSession = {
  status: string;
  mode?: string;
  sessionStart: number;
  sessionEnd?: number;
  programLucruStart?: string;
  programLucruEnd?: string;
  extraTimeLogs?: {
    type: "to_client" | "to_home";
    startTime: number;
    endTime?: number;
    minutesEligible?: number;
  }[];
};
export function attendanceRouteState(
  session: AttendanceRouteSession,
  type: "to_client" | "to_home",
  now: number,
) {
  const logs = session.extraTimeLogs || [],
    log = logs.find((l) => l.type === type && l.endTime === undefined);
  const base =
    type === "to_client"
      ? (log?.startTime ?? now)
      : (session.sessionEnd ?? now);
  const scheduleEnd = attendanceScheduleTime(
    base,
    session.programLucruEnd,
    "16:30",
  );
  const cap =
    type === "to_client"
      ? Math.min(
          attendanceScheduleTime(base, session.programLucruStart, "08:00"),
          attendanceScheduleTime(base, "08:00", "08:00"),
        )
      : Math.min(scheduleEnd + 3600000, (log?.startTime ?? now) + 3600000);
  const canStart =
    session.mode === "field" &&
    !logs.some((l) => l.type === type) &&
    (type === "to_client"
      ? session.status === "active" && now < cap
      : session.status === "completed" &&
        session.sessionEnd !== undefined &&
        session.sessionEnd >= scheduleEnd &&
        now >= session.sessionEnd &&
        now <= session.sessionEnd + 3600000 &&
        now <= scheduleEnd + 3600000);
  return {
    canStart,
    active: !!log,
    cap,
    elapsedSeconds: log
      ? Math.max(0, Math.floor((Math.min(now, cap) - log.startTime) / 1000))
      : 0,
    expired: !!log && now >= cap,
    minutes: log
      ? Math.max(0, Math.floor((Math.min(now, cap) - log.startTime) / 60000))
      : logs.find((l) => l.type === type)?.minutesEligible || 0,
  };
}
export function attendanceStopRemaining(start: number, now: number) {
  return Math.max(0, Math.ceil((60000 - (now - start)) / 1000));
}
