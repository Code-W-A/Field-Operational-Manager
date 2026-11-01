import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionReportSnapshot } from './revision-report-snapshot';

test('legacy settings snapshots do not overflow the finalized work document', () => {
  const version = JSON.stringify({ legacySettings: 'x'.repeat(434000) });
  const revision = { id: 'eq', equipmentId: 'eq', checklistVersionId: version, sections: [{ id: 's', items: [{ id: 'sensor', state: 'functional' }] }], photos: [{ id: 'photo-123', url: 'https://example.invalid/photo' }], finalObservations: 'Checked', durationText: '0h 2m' };
  const snapshot = revisionReportSnapshot([revision]);
  const work = { revision: { checklistVersionId: version }, mobileRevisionSnapshot: snapshot, raportSnapshot: { mobileRevisionSnapshot: snapshot } };
  assert(Buffer.byteLength(JSON.stringify(work)) < 500000);
  assert.deepEqual(snapshot[0].sections, revision.sections);
  assert.deepEqual(snapshot[0].photos, revision.photos);
  assert.equal(snapshot[0].durationText, revision.durationText);
  assert.equal(revision.checklistVersionId, version, 'source checklist history remains intact');
});
