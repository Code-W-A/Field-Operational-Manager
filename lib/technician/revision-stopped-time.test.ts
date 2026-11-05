import test from "node:test";
import assert from "node:assert/strict";
import { revisionStoppedTime } from "./revision-stopped-time";
test("revision report uses frozen equipment times, sums seconds and rounds once across midnight", () => {
  const work = {tipLucrare:"Revizie", equipmentIds:["a","b"], revisionEquipmentTimes:{a:{startIso:"2026-11-04T21:59:40Z",endIso:"2026-11-04T22:00:10Z"},b:{startIso:"2026-11-04T22:00:10Z",endIso:"2026-11-04T22:00:40Z"}}};
  assert.deepEqual(revisionStoppedTime(work),{endedAt:"2026-11-04T22:00:40.000Z",duration:"0h 1m"});
  assert.equal(revisionStoppedTime({...work,equipmentIds:["a","missing"]}),undefined);
  assert.equal(revisionStoppedTime({...work,revisionEquipmentTimes:{a:{startIso:"bad",endIso:"bad"}}}),undefined);
  assert.equal(revisionStoppedTime({...work,tipLucrare:"Intervenție"}),undefined);
});
