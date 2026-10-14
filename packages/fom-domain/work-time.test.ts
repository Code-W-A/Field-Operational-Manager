import test from 'node:test';
import assert from 'node:assert/strict';
import { romanianWorkTime, romanianWorkDate, romanianWorkDisplay, romanianManualInstant, normalizeWorkTimes } from './work-time';
import { crmInstant } from './crm-dates';

for (const zone of ['UTC', 'Europe/Bucharest', 'America/Los_Angeles']) {
  test(`Romanian work chronology is independent of runtime ${zone}`, () => {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      for (const [instant, date, time] of [
        ['2026-10-14T11:46:00Z', '14.10.2026', '14:46'],
        ['2026-01-14T11:46:00Z', '14.01.2026', '13:46'],
        ['2026-10-14T22:30:00Z', '15.10.2026', '01:30'],
        ['2026-03-29T00:59:00Z', '29.03.2026', '02:59'],
        ['2026-03-29T01:00:00Z', '29.03.2026', '04:00'],
        ['2026-10-25T00:59:00Z', '25.10.2026', '03:59'],
        ['2026-10-25T01:00:00Z', '25.10.2026', '03:00'],
      ]) {
        assert.equal(romanianWorkTime(instant), time);
        assert.equal(romanianWorkDate(instant), date);
        assert(romanianWorkDisplay(instant).endsWith(time));
      }
      assert.equal(romanianManualInstant('14.10.2026', '14:46'), '2026-10-14T11:46:00.000Z');
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
}
test('existing incorrect wall fields are corrected for display without changing source', () => {
  const source = { timpSosire: '2026-10-14T11:46:00Z', dataSosire: 'wrong', oraSosire: '11:46', timpPlecare: '2026-10-14T12:46:00Z', oraPlecare: '12:46' };
  const view = normalizeWorkTimes(source);
  assert.equal(view.oraSosire, '14:46'); assert.equal(view.oraPlecare, '15:46');
  assert.equal(view.dataSosire, '14.10.2026'); assert.equal(view.timpSosire, source.timpSosire);
  assert.equal(source.oraSosire, '11:46');
});
test('legacy calendar dates and incomplete chronology are preserved', () => {
  for (const timpSosire of [undefined, 'invalid', '2026-10-14', '14.10.2026']) {
    const work = { timpSosire, dataSosire: '14.10.2026', oraSosire: '11:46' };
    assert.deepEqual(normalizeWorkTimes(work), work);
  }
});
test('DST manual input rejects nonexistent hours and uses established fold conversion', () => {
  assert.throws(() => romanianManualInstant('29.03.2026', '03:30'), /nu există/);
  assert.throws(() => romanianManualInstant('31.02.2026', '12:00'));
  assert.equal(romanianManualInstant('25.10.2026', '03:30'), crmInstant('2026-10-25', '03:30'));
  assert.equal(romanianWorkTime(romanianManualInstant('25.10.2026', '03:30')), '03:30');
});
test('duration stays absolute across the autumn clock change', () => {
  const start = '2026-10-25T00:45:00Z', end = '2026-10-25T01:15:00Z';
  assert.equal(romanianWorkTime(start), '03:45'); assert.equal(romanianWorkTime(end), '03:15');
  assert.equal((Date.parse(end) - Date.parse(start)) / 60000, 30);
});
