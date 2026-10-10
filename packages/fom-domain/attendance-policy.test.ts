import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attendanceDay,
  attendanceRouteState,
  attendanceSpecialDay,
  attendanceStopRemaining,
} from "./attendance-policy";
const at = (time: string) => Date.parse(`2026-10-08T${time}:00+03:00`);
const session = {
  status: "active",
  mode: "field",
  sessionStart: at("07:00"),
  programLucruStart: "08:00",
  programLucruEnd: "16:30",
  extraTimeLogs: [],
};
test("shared day, special days and minimum duration use Bucharest", () => {
  assert.equal(attendanceDay(Date.parse("2026-10-08T22:00:00Z")), "2026-10-09");
  assert.equal(
    attendanceSpecialDay(Date.parse("2026-10-10T12:00:00Z"))?.kind,
    "saturday",
  );
  assert.equal(
    attendanceSpecialDay(at("08:00"), [
      { date: "2026-10-08", label: "Sărbătoare" },
    ])?.kind,
    "legal_holiday",
  );
  assert.equal(attendanceStopRemaining(at("08:00"), at("08:00") + 59000), 1);
  assert.equal(attendanceStopRemaining(at("08:00"), at("08:01")), 0);
});
test("client route is single use and capped at earlier program start or 08:00", () => {
  assert.equal(
    attendanceRouteState(session, "to_client", at("07:30")).canStart,
    true,
  );
  assert.equal(
    attendanceRouteState(session, "to_client", at("08:00")).canStart,
    false,
  );
  const active = {
    ...session,
    programLucruStart: "07:45",
    extraTimeLogs: [{ type: "to_client" as const, startTime: at("07:30") }],
  };
  const state = attendanceRouteState(active, "to_client", at("08:30"));
  assert.equal(state.minutes, 15);
  assert.equal(state.expired, true);
  assert.equal(state.canStart, false);
});
test("home route requires checkout and stays inside both one-hour windows", () => {
  assert.equal(
    attendanceRouteState(session, "to_home", at("17:00")).canStart,
    false,
  );
  const completed = {
    ...session,
    status: "completed",
    sessionEnd: at("16:30"),
  };
  assert.equal(
    attendanceRouteState(completed, "to_home", at("17:00")).canStart,
    true,
  );
  assert.equal(
    attendanceRouteState(completed, "to_home", at("17:31")).canStart,
    false,
  );
  const active = {
    ...completed,
    extraTimeLogs: [{ type: "to_home" as const, startTime: at("17:00") }],
  };
  assert.equal(
    attendanceRouteState(active, "to_home", at("18:00")).minutes,
    30,
  );
});
