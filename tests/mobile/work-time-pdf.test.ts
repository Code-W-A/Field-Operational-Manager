import test from 'node:test';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { renderServiceReport } from '../../lib/pdf/service-report';

test('real PDF renderer prefers Romanian instants over stale arrival/departure fields', async () => {
  const texts: string[] = [];
  const event: [string, (this: jsPDF) => void] = ['initialized', function () {
    const original = this.text;
    this.text = function (this: jsPDF, ...args: any[]) { texts.push(String(args[0])); return (original as any).apply(this, args); } as typeof original;
  }];
  (jsPDF.API.events as any).push(event);
  try {
    const doc = await renderServiceReport({
      id: 'time-test', client: 'Client test', locatie: 'Locație test', numarRaport: '123',
      dataInterventie: '14.10.2026', timpSosire: '2026-10-14T11:46:00Z', oraSosire: '11:46', dataSosire: '14.10.2026',
      timpPlecare: '2026-10-14T12:46:00Z', oraPlecare: '12:46', dataPlecare: '14.10.2026', products: [],
    }, { readOnly: true, image: async () => null, revisions: async () => [] });
    if (process.env.FOM_WORK_TIME_PDF) writeFileSync(process.env.FOM_WORK_TIME_PDF, Buffer.from(doc.output('arraybuffer')));
    assert(texts.includes('14:46')); assert(texts.includes('15:46'));
    assert(!texts.includes('11:46')); assert(!texts.includes('12:46'));
  } finally {
    const events = jsPDF.API.events as any;
    events.splice(events.indexOf(event), 1);
  }
});
