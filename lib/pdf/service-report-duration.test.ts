import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { renderServiceReport } from './service-report';

test('service PDF preserves frozen duration instead of truncating seconds or summing equipment again', async () => {
  const texts: string[] = [];
  const event: [string, (this: jsPDF) => void] = ['initialized', function () {
    const text = this.text;
    this.text = function (this: jsPDF, ...args: any[]) {
      texts.push(String(args[0]));
      return (text as any).apply(this, args);
    } as typeof text;
  }];
  (jsPDF.API.events as any).push(event);
  try {
    for (const frozen of ['0h 2m', '0h 0m', '2h 15m']) {
      texts.length = 0;
      await renderServiceReport({ client: 'Test', locatie: 'Test', products: [], timpSosire: '2026-11-01T09:58:48.634Z', timpPlecare: '2026-11-01T10:00:46.464Z', durataInterventie: frozen }, { image: async () => null, revisions: async () => [] });
      assert(texts.includes(frozen), frozen);
      assert(!texts.includes('0h 1m'), 'the PDF must not truncate a frozen rounded value');
    }
  } finally {
    const events = jsPDF.API.events as any;
    events.splice(events.indexOf(event), 1);
  }
});
