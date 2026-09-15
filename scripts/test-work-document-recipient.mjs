/** Isolated browser regression: real dialogs and recipient code, simulated external services. */
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import path from 'node:path'

const root = process.cwd()
const mocks = {
  '@/lib/firebase/firestore': `
    const read = async (kind, id, options) => {
      window.fixture.reads.push({ kind, id, options });
      if (window.fixture.failure === kind) throw new Error('offline');
      return structuredClone(window.fixture[kind]);
    };
    export const getLucrareById = (id, options) => read('work', id, options);
    export const getClientById = (id, options) => read('client', id, options);
    export const updateLucrare = async (...args) => { window.fixture.writes.push(args); };
    export const addUserLogEntry = async () => {};
  `,
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
  '@/components/product-table-form': `export const ProductTableForm = () => null;`,
}
const result = await build({
  stdin: { contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { OfferEditorDialog } from './app/dashboard/lucrari/[id]/offer-editor-dialog';
    import { DevizEditorDialog } from './app/dashboard/lucrari/[id]/deviz-editor-dialog';
    const products = [{ id: 'p', name: 'Current service', quantity: 1, price: 150, total: 150, um: 'buc' }];
    const versionProducts = [{ id: 'old', name: 'Historical service', quantity: 1, price: 100, total: 100, um: 'buc' }];
    const version = { savedAt: '2026-09-10T10:00:00Z', products: versionProducts, total: 90 };
    const legacy = { locationEmail: 'support@marf.ro', email: 'support@marf.ro', contactEmail: 'support@marf.ro' };
    window.fixture = {
      work: { id: 'ticket', numarRaport: '001', clientId: 'client', locationId: 'location', client: 'MARF',
        persoanaContact: 'Marf Admin', persoanaContactEmail: 'support@marf.ro', email: 'support@marf.ro',
        clientInfo: legacy, locatie: 'Avangarde', preluatDispecer: true, products, devizProducts: products,
        offerVersions: [version], devizVersions: [version] },
      client: { locatii: [{ id: 'location', nume: 'Avangarde', persoaneContact: [{ nume: 'Marf Admin', email: 'suport@marf.ro' }] }] },
      reads: [], writes: [], toasts: [], generatedInputs: [], pdfDelay: 0, pdfFailure: false
    };
    const Component = new URLSearchParams(location.search).get('kind') === 'deviz' ? DevizEditorDialog : OfferEditorDialog;
    createRoot(document.getElementById('root')).render(<Component lucrareId="ticket" open={true} onOpenChange={() => {}} initialProducts={products} />);
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
  const browser = await chromium.launch({ headless: true })
  try {
    let count = 0
    for (const kind of ['offer', 'deviz']) {
      for (const scenario of ['current', 'changed', 'client-read-error', 'work-read-error', 'client-missing', 'work-missing', 'client-id-missing', 'invalid-email', 'legacy-client-id']) {
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
        }, scenario)
        await page.getByRole('button', { name: kind === 'offer' ? 'Trimite ofertă' : 'Trimite deviz', exact: true }).click()
        await page.waitForFunction(() => window.fixture.toasts.some(t => t.title === 'Eroare trimitere' || t.title === 'Ofertă trimisă' || t.title === 'Deviz trimis'))
        const state = await page.evaluate(() => window.fixture)
        assert.ok(state.reads.length > 0)
        assert.ok(state.reads.every(r => r.options?.serverOnly === true), 'send must bypass Firestore cache')
        const blocked = !['current', 'changed', 'legacy-client-id'].includes(scenario)
        if (blocked) {
          assert.equal(requests.length, 0, `${kind}/${scenario}: no token or email requests`)
          assert.equal(state.writes.length, 0)
          assert.ok(state.toasts.some(t => t.title === 'Eroare trimitere'))
        } else {
          const email = requests.find(r => r.url === '/api/users/invite')
          assert.deepEqual(email?.body.to, [scenario === 'changed' ? 'actualizat@marf.ro' : 'suport@marf.ro'])
          assert.equal(email.body.type, kind === 'offer' ? 'OFFER' : 'DEVIZ')
          assert.ok(state.toasts.some(t => t.title === (kind === 'offer' ? 'Ofertă trimisă' : 'Deviz trimis')))
        }
        console.log(`PASS ${kind}: ${scenario}`)
        count++
        await page.close()
      }
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
