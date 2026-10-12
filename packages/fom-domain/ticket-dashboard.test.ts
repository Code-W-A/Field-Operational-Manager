import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OVERDUE_DEFAULTS,
  OVERDUE_SETTING_IDS,
  overdueConfigFromSettings,
  isOverdueWork,
  groupDashboardTickets,
  ticketSchedule,
  dashboardRefreshDelay,
  bucharestCalendar,
} from "./ticket-dashboard";
import { visibleWork, emptyBundle, readBootstrap } from "./index";
const now = new Date("2026-10-12T14:59:00Z"); // 17:59 in Bucharest
const work = (id: string, date: unknown = "2026-10-12", patch = {}) => ({
  id,
  dataInterventie: date,
  statusLucrare: "Atribuită",
  technicianIds: ["tech"],
  ...patch,
});
test("today, tomorrow, past and missing dates form three exclusive sorted lists", () => {
  const input = [
    work("future", "2026-10-13"),
    work("today-late", "2026-10-12T11:00"),
    work("today-early", "2026-10-12T08:00"),
    work("past", "2026-10-11"),
    work("scanned", "2026-10-10", { equipmentVerified: true }),
    work("undated", null),
    work("bad", "31.04.2026"),
  ];
  const original = JSON.stringify(input);
  const g = groupDashboardTickets([...input, input[0]], {}, now);
  assert.deepEqual(
    g.current.map((e) => e.work.id),
    ["scanned", "today-early", "today-late", "bad", "undated"],
  );
  assert.deepEqual(
    g.overdue.map((e) => e.work.id),
    ["past"],
  );
  assert.deepEqual(
    g.future.map((e) => e.work.id),
    ["future"],
  );
  assert.equal(g.current[0].note, "În lucru dintr-o zi anterioară");
  assert.equal(g.current.at(-1)?.note, "Fără dată programată");
  assert.equal(JSON.stringify(input), original);
});
test("18:00 and midnight transitions obey Bucharest time even on another host timezone", () => {
  const today = work("today");
  assert.equal(isOverdueWork(today, {}, now), false);
  assert.equal(
    isOverdueWork(today, {}, new Date("2026-10-12T15:00:00Z")),
    true,
  );
  assert.equal(
    isOverdueWork(today, {}, new Date("2026-10-12T21:00:00Z")),
    true,
  );
  const tomorrow = work("tomorrow", "2026-10-13");
  assert.equal(
    groupDashboardTickets([tomorrow], {}, new Date("2026-10-12T20:59:59Z"))
      .future.length,
    1,
  );
  assert.equal(
    groupDashboardTickets([tomorrow], {}, new Date("2026-10-12T21:00:00Z"))
      .current.length,
    1,
  );
  assert.equal(
    dashboardRefreshDelay(new Date("2026-10-12T14:59:59.750Z")),
    250,
  );
  assert.equal(
    dashboardRefreshDelay(new Date("2026-10-12T20:59:59.750Z")),
    250,
  );
  assert.equal(dashboardRefreshDelay(now), 60000);
});
test("scan pending stays overdue, confirmed scan and dispatcher pickup suppress overdue", () => {
  const past = work("past", "2026-10-11");
  const pending = { ...past, localVerificationPending: true };
  assert.equal(isOverdueWork(pending), true);
  assert.equal(isOverdueWork({ ...past, equipmentVerified: true }), false);
  assert.equal(isOverdueWork({ ...past, preluatDispecer: true }), false);
  assert.equal(
    isOverdueWork({ ...past, technicianIds: [], statusLucrare: "Listată" }),
    false,
  );
});
test("configuration mirrors all Next.js overdue flags and never grants a date-less overdue ticket", () => {
  const past = work("past", "2026-10-11");
  assert.equal(isOverdueWork(past, { intarziateEnabled: false }, now), false);
  assert.equal(
    isOverdueWork(past, { intarziateIncludePastDays: false }, now),
    false,
  );
  assert.equal(
    isOverdueWork(
      work("today"),
      { intarziateIncludeToday: false },
      new Date("2026-10-12T16:00:00Z"),
    ),
    false,
  );
  assert.equal(
    isOverdueWork(
      work("today"),
      { intarziateTodayRequiresAfter18: false },
      now,
    ),
    true,
  );
  assert.equal(
    isOverdueWork(
      { ...past, equipmentVerified: true },
      { intarziateRequireNotScanned: false },
      now,
    ),
    true,
  );
  assert.equal(
    isOverdueWork(
      { ...past, technicianIds: [], statusLucrare: "Listată" },
      { intarziateRequireAssigned: false },
      now,
    ),
    true,
  );
  assert.equal(
    isOverdueWork(
      work("missing", null),
      { intarziateRequireExecDate: false },
      now,
    ),
    false,
  );
  const config = overdueConfigFromSettings([
    { id: OVERDUE_SETTING_IDS.intarziateIncludeToday, value: false },
    { id: "private-setting", value: "private" },
  ]);
  assert.deepEqual(config, {
    ...OVERDUE_DEFAULTS,
    intarziateIncludeToday: false,
  });
  assert.deepEqual(overdueConfigFromSettings([]), OVERDUE_DEFAULTS);
  // Match Next.js Boolean(getPredefinedSettingValue(...)) for existing legacy records.
  assert.equal(
    overdueConfigFromSettings([{ id: OVERDUE_SETTING_IDS.intarziateEnabled }])
      .intarziateEnabled,
    false,
  );
  assert.equal(
    overdueConfigFromSettings([
      { id: OVERDUE_SETTING_IDS.intarziateEnabled, value: "false" },
    ]).intarziateEnabled,
    true,
  );
});
test("completed reports stay consultable, inaccessible tickets stay excluded, all types are classified", () => {
  const actor = {
    uid: "tech",
    displayName: "Tech",
    role: "tehnician" as const,
  };
  const all = [
    work("completed", "2026-10-14", {
      raportGenerat: true,
      statusLucrare: "Finalizat",
    }),
    work("picked", "2026-10-12", {
      raportGenerat: true,
      preluatDispecer: true,
    }),
    work("lost", "2026-10-12", { technicianIds: ["other"] }),
    work("canceled", "2026-10-12", { statusLucrare: "Anulată" }),
    work("archived", "2026-10-12", { statusLucrare: "Arhivată" }),
  ];
  const g = groupDashboardTickets(
    all.filter((w) => visibleWork(w, actor)),
    {},
    now,
  );
  assert.deepEqual(
    g.current.map((e) => e.work.id),
    ["completed"],
  );
  assert.match(g.current[0].note!, /consultare/);
  for (const tipLucrare of [
    "Intervenție",
    "Intervenție în garanție",
    "Revizie",
    "Instalare",
  ])
    assert.equal(
      groupDashboardTickets(
        [work(tipLucrare, "2026-10-13", { tipLucrare })],
        {},
        now,
      ).future.length,
      1,
    );
});
test("legacy Romanian, ISO, timestamp and DST dates normalize consistently", () => {
  assert.equal(ticketSchedule("12.10.2026 08:00")?.day, "2026-10-12");
  assert.equal(ticketSchedule("2026-10-11T21:30:00Z")?.day, "2026-10-12");
  assert.equal(
    ticketSchedule({ seconds: Date.parse("2026-10-11T21:30:00Z") / 1000 })?.day,
    "2026-10-12",
  );
  assert.equal(
    ticketSchedule(new Date("2026-10-11T21:30:00Z"))?.day,
    "2026-10-12",
  );
  assert.equal(
    bucharestCalendar(new Date("2026-10-25T21:59:59Z")).day,
    "2026-10-25",
  );
  assert.equal(
    bucharestCalendar(new Date("2026-10-25T22:00:00Z")).day,
    "2026-10-26",
  );
  for (const value of [
    "bad",
    "2026-02-30",
    "2026-10-12T24:00",
    "2026-10-12T23:61",
    null,
    new Date(NaN),
  ])
    assert.equal(ticketSchedule(value), null);
});
test("old bootstrap caches omit optional configuration and retain default classification", () => {
  const bundle = readBootstrap(
    {
      projectId: "demo",
      contractVersion: 1,
      bundle: { ...emptyBundle(), works: [work("past", "2026-10-11")] },
    },
    "demo",
  );
  assert.equal(
    groupDashboardTickets(bundle.works, bundle.dashboardOverdueConfig, now)
      .overdue.length,
    1,
  );
});

test("legacy canceled metadata stays outside all groups", () => {
  for (const patch of [
    { anulat: true },
    { anulatAt: "2026-10-10" },
    { motivAnulare: "Anulat" },
    { statusLucrare: "anulat" },
  ]) {
    const groups = groupDashboardTickets(
      [work("cancel", "2026-10-13", patch)],
      {},
      now,
    );
    assert.equal(Object.values(groups).flat().length, 0);
  }
});
