/** Isolated browser regression: real dialogs and recipient code, simulated external services. */
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import path from 'node:path'

const root = process.cwd()
const mocks = {
  "@/lib/firebase/config": `export const db = null;`,
  '@/lib/firebase/firestore': `
    const read = async (kind, id, options) => {
      window.fixture.reads.push({ kind, id, options });
      if (window.fixture.failure === kind) throw new Error('offline');
      return structuredClone(window.fixture[kind]);
    };
    export const getLucrareById = (id, options) => read('work', id, options);
    export const getClientById = (id, options) => read('client', id, options);
    export const updateLucrare = async (...args) => {
      window.fixture.writes.push(args);
      for (const [key, value] of Object.entries(args[1])) {
        window.fixture.work[key] = value?.__append ? [...(window.fixture.work[key] || []), ...value.__append] : value;
      }
    };
    export const addUserLogEntry = async () => {};
  `,
  '@/lib/installations/management-client': `export const workArrayUnion = (...values) => ({ __append: values });`,
  '@/contexts/AuthContext': `export const useAuth = () => ({ userData: { uid: 'test', displayName: 'Test' } });`,
  '@/hooks/use-toast': `export const toast = (value) => { window.fixture.toasts.push(value); };`,
  '@/hooks/use-settings': `const items = []; export const useTargetList = () => ({ items }); export const useTargetValue = () => ({ value: 1 });`,
  '@/lib/settings/offer-vat': `export const DEFAULT_OFFER_VAT_PERCENT = 21; export const getDefaultOfferVatPercent = async () => 21;`,
  '@/lib/utils/offer-pdf': `
    export const generateOfferPdf = async (input) => {
      window.fixture.generatedInputs.push(structuredClone(input));
      if (window.fixture.pdfFailure) throw new Error('generator failed');
      if (window.fixture.pdfDelay) await new Promise(resolve => setTimeout(resolve, window.fixture.pdfDelay));
      return new Blob(['pdf'], { type: 'application/pdf' });
    };
    export const generateDevizPdf = generateOfferPdf;
  `,
}
const result = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { OfferEditorDialog } from './app/dashboard/lucrari/[id]/offer-editor-dialog';
    import { DevizEditorDialog } from './app/dashboard/lucrari/[id]/deviz-editor-dialog';
    const products = [{ id: 'p', name: 'Current service', quantity: 1, price: 150, total: 150, um: 'buc' }];
    const versionProducts = [{ id: 'old', name: 'Historical service', quantity: 1, price: 100, total: 100, um: 'buc' }];
    const version = { savedAt: '2026-09-10T10:00:00Z', savedBy: 'Alin Ionescu', products: versionProducts, total: 90 };
    const legacy = { cui: 'RO-HISTORIC', locationEmail: 'support@marf.ro', email: 'support@marf.ro', contactEmail: 'support@marf.ro' };
    window.fixture = {
      work: { id: 'ticket', numarRaport: '001', clientId: 'client', locationId: 'location', client: 'MARF',
        persoanaContact: 'Marf Admin', persoanaContactEmail: 'support@marf.ro', email: 'support@marf.ro',
        clientInfo: legacy, locatie: 'Avangarde', preluatDispecer: true, preluatDe: 'Liliana Ionescu',
        offerPreparedBy: 'Autor ofertă anterior', products, devizProducts: products,
        conditiiOferta: ['Plata: 100% avans', 'Livrare: 30 zile', 'Instalare: 2 zile'],
        offerVersions: [version], devizVersions: [version] },
      client: { id: 'client', nume: 'MARF ACTUAL', cui: 'RO-CURRENT', locatii: [{ id: 'location', nume: 'Avangarde', persoaneContact: [{ nume: 'Marf Admin', email: 'suport@marf.ro' }] }] },
      reads: [], writes: [], toasts: [], generatedInputs: [], pdfDelay: 0, pdfFailure: false
    };
    const Component = new URLSearchParams(location.search).get('kind') === 'deviz' ? DevizEditorDialog : OfferEditorDialog;
    createRoot(document.getElementById('root')).render(<Component lucrareId="ticket" open={true} onOpenChange={() => {}} initialProducts={Component === OfferEditorDialog ? versionProducts : products} />);
  `, resolveDir: root, loader: 'tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"test"' },
  plugins: [{ name: 'external-services', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js' }))
  } }],
})
const bundle = result.outputFiles[0].text
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); return }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><title>Document recipient regression</title><div id="root"></div><script src="/bundle.js"></script></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) {
  console.log(url)
} else {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined })
  try {
    let count = 0
    for (const kind of ['offer', 'deviz']) {
      for (const scenario of ['current', 'changed', 'client-read-error', 'work-read-error', 'client-missing', 'work-missing', 'client-id-missing', 'invalid-email', 'legacy-client-id', ...(kind === 'offer' ? ['ticket-label', 'ticket-label-empty', 'ticket-label-partial'] : [])]) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
        const requests = []
        await page.route('**/api/**', async route => {
          const request = route.request()
          requests.push({ url: new URL(request.url()).pathname, body: request.postDataJSON() })
          await route.fulfill({ json: { success: true, acceptUrl: 'https://example.test/accept', rejectUrl: 'https://example.test/reject' } })
        })
        await page.goto(`${url}/?kind=${kind}`)
        await page.getByText('suport@marf.ro', { exact: true }).waitFor()
        await page.evaluate(scenario => {
          const f = window.fixture
          f.reads = []
          if (scenario === 'changed') f.client.locatii[0].persoaneContact[0].email = 'actualizat@marf.ro'
          if (scenario === 'client-read-error') f.failure = 'client'
          if (scenario === 'work-read-error') f.failure = 'work'
          if (scenario === 'client-missing') f.client = null
          if (scenario === 'work-missing') f.work = null
          if (scenario === 'client-id-missing') delete f.work.clientId
          if (scenario === 'invalid-email') f.client.locatii[0].persoaneContact[0].email = 'invalid'
          if (scenario === 'legacy-client-id') { delete f.work.clientId; f.work.clientInfo.id = 'client' }
          if (scenario === 'ticket-label') {
            f.work.nrLucrare = '  #00123  '
            f.work.echipament = '  Barieră   <acces> & "auto"  '
            f.work.locatie = " Sediu\n București 'Nord' "
          }
          if (scenario === 'ticket-label-empty') {
            f.work.nrLucrare = '  '
            f.work.numarRaport = ' '
            f.work.locatie = ''
          }
          if (scenario === 'ticket-label-partial') {
            f.work.nrLucrare = ' '
            f.work.numarRaport = ''
            f.work.echipament = 'Barieră acces'
            f.work.locatie = ' '
          }
        }, scenario)
        await page.getByRole('button', { name: kind === 'offer' ? 'Trimite ofertă' : 'Trimite deviz', exact: true }).click()
        await page.waitForFunction(() => window.fixture.toasts.some(t => t.title === 'Eroare trimitere' || t.title === 'Ofertă trimisă' || t.title === 'Deviz trimis'))
        const state = await page.evaluate(() => window.fixture)
        assert.ok(state.reads.length > 0)
        assert.ok(state.reads.every(r => r.options?.serverOnly === true), 'send must bypass Firestore cache')
        const blocked = !['current', 'changed', 'legacy-client-id', 'ticket-label', 'ticket-label-empty', 'ticket-label-partial'].includes(scenario)
        if (blocked) {
          assert.equal(requests.length, 0, `${kind}/${scenario}: no token or email requests`)
          assert.equal(state.writes.length, 0)
          assert.ok(state.toasts.some(t => t.title === 'Eroare trimitere'))
        } else {
          const email = requests.find(r => r.url === '/api/users/invite')
          assert.deepEqual(email?.body.to, [scenario === 'changed' ? 'actualizat@marf.ro' : 'suport@marf.ro'])
          assert.equal(email.body.type, kind === 'offer' ? 'OFFER' : 'DEVIZ')
          if (kind === 'offer') {
            const label = scenario === 'ticket-label' ? `#00123 — Barieră <acces> & "auto" — Sediu București 'Nord'`
              : scenario === 'ticket-label-empty' ? ''
              : scenario === 'ticket-label-partial' ? 'Barieră acces' : '001 — Avangarde'
            const expectedSubject = label ? `Ofertă pentru tichetul ${label}` : 'Ofertă pentru tichet'
            assert.equal(email.body.subject, expectedSubject)
            const content = await page.evaluate(html => {
              const doc = new DOMParser().parseFromString(html, 'text/html')
              return { heading: doc.querySelector('h2').textContent, intro: doc.querySelector('p').textContent, injected: !!doc.querySelector('acces') }
            }, email.body.html)
            assert.equal(content.heading, expectedSubject)
            assert.equal(content.intro, `În vederea finalizării tichetului${label ? ` ${label}` : ''} am constatat că sunt necesare următoarele echipamente și servicii:`)
            assert.equal(content.injected, false)
          }
          assert.equal(state.generatedInputs.at(-1).beneficiar.cui, 'RO-HISTORIC', 'Resending a legacy version must not replace its identity with live data')
          if (kind === 'offer') assert.equal(state.generatedInputs.at(-1).preparedBy, 'Test')
          assert.ok(state.toasts.some(t => t.title === (kind === 'offer' ? 'Ofertă trimisă' : 'Deviz trimis')))
        }
        console.log(`PASS ${kind}: ${scenario}`)
        count++
        await page.close()
      }
    }

    for (const [label, empty] of [
      ['Termen de plată', '  '], ['Termen de livrare', ''], ['Termen de instalare', ' '],
      ['Denumire 1', '  '], ['UM 1', ''], ['Cantitate 1', ''], ['PU (lei) 1', ''], ['Discount (%)', ''],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
      const calls = []
      await page.route('**/api/**', async route => {
        calls.push(new URL(route.request().url()).pathname)
        await route.fulfill({ json: { success: true } })
      })
      await page.goto(`${url}/?kind=offer`)
      await page.getByText('suport@marf.ro', { exact: true }).waitFor()
      const send = page.getByRole('button', { name: 'Trimite ofertă', exact: true })
      assert.equal(await send.isEnabled(), true)
      await page.getByLabel(label, { exact: true }).fill(empty)
      await page.getByLabel(label, { exact: true }).blur()
      assert.equal(await send.isEnabled(), false, label)
      assert.equal(await page.getByLabel(label, { exact: true }).getAttribute('aria-invalid'), 'true', label)
      assert.equal(await page.evaluate(() => window.fixture.writes.length), 0)
      assert.deepEqual(calls, [])
      if (label === 'Termen de plată') {
        await page.getByRole('button', { name: 'Salvează', exact: true }).click()
        await page.waitForFunction(() => window.fixture.work.offerVersions.length === 2)
        assert.equal(await send.isEnabled(), false, 'saving an incomplete draft must not enable sending')
        assert.ok(calls.every(url => url.endsWith('/offer-prepared')))
        await page.getByLabel(label, { exact: true }).fill('100% avans')
        assert.equal(await send.isEnabled(), false, 'corrected terms must be saved first')
        await page.getByRole('button', { name: 'Salvează', exact: true }).click()
        await page.waitForFunction(() => window.fixture.work.offerVersions.length === 3)
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Trimite ofertă' && !b.disabled))
        const state = await page.evaluate(() => window.fixture)
        assert.equal(state.work.offerVersions.at(-1).conditions[0], 'Plata: 100% avans')
      } else {
        await page.getByRole('button', { name: 'Salvează', exact: true }).click()
        await page.waitForFunction(() => window.fixture.work.offerVersions.length === 2)
        await page.getByRole('button', { name: 'Salvează', exact: true }).waitFor()
        assert.equal(await send.isEnabled(), false, `${label}: saving an incomplete draft must not enable sending`)
        assert.ok(calls.every(url => url.endsWith('/offer-prepared')))
      }
      console.log(`PASS offer validation: ${label}; no email sent`)
      count++
      await page.close()
    }

    const downloadPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const apiRequests = []
    await downloadPage.route('**/api/**', async route => {
      apiRequests.push(new URL(route.request().url()).pathname)
      await route.fulfill({ json: { success: true } })
    })
    await downloadPage.goto(`${url}/?kind=offer`)
    await downloadPage.evaluate(() => { window.fixture.pdfDelay = 150 })
    const versionDownload = downloadPage.waitForEvent('download')
    await downloadPage.getByRole('button', { name: 'Descarcă', exact: true }).click()
    await downloadPage.getByRole('button', { name: 'Se descarcă...', exact: true }).waitFor()
    const download = await versionDownload
    assert.equal(download.suggestedFilename(), 'oferta_001_versiunea_1.pdf')
    await downloadPage.waitForFunction(() => window.fixture.toasts.some(t => t.title === 'Ofertă descărcată'))
    const downloadState = await downloadPage.evaluate(() => window.fixture)
    assert.equal(downloadState.generatedInputs.at(-1).products[0].name, 'Historical service')
    assert.equal(downloadState.generatedInputs.at(-1).adjustmentPercent, 10)
    assert.equal(downloadState.generatedInputs.at(-1).offerNumber, 1)
    assert.equal(downloadState.generatedInputs.at(-1).preparedBy, 'Alin Ionescu')
    assert.equal(downloadState.writes.length, 0)
    assert.deepEqual(apiRequests, [])
    console.log('PASS offer history: selected legacy version downloads without writes or API requests')
    count++
    await downloadPage.close()

    const errorPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    await errorPage.goto(`${url}/?kind=offer`)
    await errorPage.evaluate(() => { window.fixture.pdfFailure = true })
    await errorPage.getByRole('button', { name: 'Descarcă', exact: true }).click()
    await errorPage.waitForFunction(() => window.fixture.toasts.some(t => t.title === 'Eroare descărcare'))
    assert.equal((await errorPage.evaluate(() => window.fixture.writes.length)), 0)
    console.log('PASS offer history: PDF generation failure shows an error without writes')
    count++
    await errorPage.close()

    console.log(`${count} browser scenarios passed; all outgoing API requests intercepted.`)
  } finally {
    await browser.close()
    server.close()
  }
}
