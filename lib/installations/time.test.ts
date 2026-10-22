import test from "node:test";
import assert from "node:assert/strict";
import {
  startInstallationTime,
  stopInstallationTime,
  installationSeconds,
  installationDuration,
  installationTimeLines,
} from "../../packages/fom-domain/installation";
test("intervals preserve history, deduplicate starts and freeze stopped time", () => {
  const start = "2026-10-21T20:59:40Z",
    stop = "2026-10-21T21:00:20Z";
  const intervals = startInstallationTime([], ["a", "a", "b"], start)!;
  assert.equal(intervals.length, 2);
  assert.deepEqual(startInstallationTime(intervals, ["a"], start), intervals);
  const stopped = stopInstallationTime(intervals, stop)!;
  assert.equal(installationSeconds(stopped, Date.now()), 80);
  assert.equal(installationDuration(80), "0 h 1 min");
  assert.deepEqual(
    stopInstallationTime(stopped, "2026-10-22T10:00:00Z"),
    stopped,
  );
  const returned = startInstallationTime(stopped, ["a"], stop)!;
  assert.equal(returned.length, 3);
  assert.equal(installationSeconds(returned, Date.parse(stop) + 20000), 100);
  assert.deepEqual(installationTimeLines({}), ["Timp neînregistrat"]);
  assert.equal(startInstallationTime(undefined, ["a"], start), undefined);
  assert.equal(stopInstallationTime(undefined, stop), undefined);
});
test("transfer stops only the moving participant and formats Bucharest midnight", () => {
  const intervals = startInstallationTime(
    [],
    ["a", "b"],
    "2026-10-21T20:59:00Z",
  )!;
  const moved = stopInstallationTime(intervals, "2026-10-21T21:01:00Z", "b")!;
  assert.equal(moved[0].endedAt, undefined);
  assert.equal(moved[1].endedAt, "2026-10-21T21:01:00Z");
  const lines = installationTimeLines(
    { timeIntervals: moved },
    Date.parse("2026-10-21T21:01:00Z"),
  );
  assert.match(lines[1], /22.10.2026/);
  assert.match(lines[2], /0 h 4 min/);
  assert.equal(installationDuration(29), "0 h 0 min");
  assert.equal(installationDuration(30), "0 h 1 min");
});
