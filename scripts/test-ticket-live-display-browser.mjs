/** Isolated real hook/components/form + Firestore. No Functions, emails or production config. */
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const projectId = 'demo-fom-ticket-display'
const host = '127.0.0.1:8281'
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const directory = await mkdtemp(path.join(tmpdir(), 'fom-ticket-display-'))
  await writeFile(path.join(directory, 'firestore.rules'), `rules_version = '2';
    service cloud.firestore { match /databases/{database}/documents {
      match /clienti/{clientId} { allow list: if true; allow get: if clientId != 'denied'; }
      match /lucrari/{id} { allow read: if true; allow create, update: if id.matches("phase2-.*"); }
    } }`)
  await writeFile(path.join(directory, 'firebase.json'), JSON.stringify({ firestore: { rules: 'firestore.rules' },
    emulators: { firestore: { host: '127.0.0.1', port: 8281 }, hub: { port: 4501 }, logging: { port: 4601 }, ui: { enabled: false } } }))
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'"
  const command = `${quote(process.execPath)} ${quote(fileURLToPath(import.meta.url))}${process.argv.includes('--serve') ? ' --serve' : ''}`
  const emulatorEnv = { ...process.env, FIREBASE_EMULATORS_PATH: path.join(tmpdir(), 'fom-ticket-display-emulators') }
  delete emulatorEnv.DEBUG
  const child = spawn('firebase', ['emulators:exec', '--only', 'firestore', '--project', projectId, '--config', path.join(directory, 'firebase.json'), command], {
    cwd: directory, stdio: 'inherit', env: emulatorEnv,
  })
  child.on('error', error => { console.error(error); process.exitCode = 1 })
  child.on('exit', code => { process.exitCode = code ?? 1 })
} else {
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, host, 'Only the isolated display emulator is allowed')
  assert.equal(process.env.GCLOUD_PROJECT, projectId, 'Only the demo project is allowed')
  await run()
}

async function run() {
  const require = createRequire(new URL('../firebase-functions/package.json', import.meta.url))
  const { initializeApp } = require('firebase-admin/app')
  const { getFirestore } = require('firebase-admin/firestore')
  initializeApp({ projectId })
  const db = getFirestore()
  const client = { id: 'c', nume: 'Client inițial', telefon: '100', email: 'office@example.test', cif: 'RO123', regCom: 'J123',
    locatii: [{ id: 'l', nume: 'Locație', adresa: 'Adresă inițială', persoaneContact: [{ id: 'p', nume: 'Contact', telefon: '200', email: 'contact@example.test' }] }] }
  const work = { id: 'w', clientId: 'c', locationId: 'l', contactId: 'p', client: client.nume, locatie: 'Locație',
    persoanaContact: 'Contact', telefon: '200', persoanaContactEmail: 'contact@example.test', statusLucrare: 'Listată',
    tehnicieni: [], tipLucrare: 'Intervenție', descriere: '', clientInfo: { locationAddress: 'Adresă inițială', telefon: '100', email: client.email },
    contactSync: { clientId: 'c', locationId: 'l', contactId: 'p', values: {
      client: client.nume, locatie: 'Locație', persoanaContact: 'Contact', telefon: '200', persoanaContactEmail: 'contact@example.test',
      'clientInfo.locationAddress': 'Adresă inițială', 'clientInfo.telefon': '100', 'clientInfo.email': client.email,
    }, conflicts: [] }, offerVersions: [{ name: 'PDF istoric', email: 'contact@example.test' }] }
  const second = { ...structuredClone(client), id: 'c2', nume: 'Client secundar' }
  const work2 = { ...structuredClone(work), id: 'w2', clientId: 'c2', client: second.nume, contactSync: { ...work.contactSync, clientId: 'c2', values: { ...work.contactSync.values, client: second.nume } } }
  await db.doc('clienti/c').set(client)
  await db.doc('clienti/c2').set(second)
  await db.doc('clienti/denied').set({ ...client, id: 'denied' })
  await db.doc('lucrari/w').set(work)
  await db.doc('lucrari/w2').set(work2)
  const before = await db.collection('lucrari').get()
  const mocks = {
    '@/contexts/AuthContext': `export const useAuth = () => ({ userData: { uid: 'browser-test', role: 'admin', displayName: 'Test' } });`,
    '@/hooks/use-settings': `const items = []; export const useTargetList = () => ({ items }); export const useTargetValue = () => ({ value: null });`,
    '@/hooks/use-toast': `export const toast = () => {};`,
    'next/navigation': `const router = { push() {}, replace() {}, refresh() {} }; export const useRouter = () => router; export const usePathname = () => '/test'; export const useSearchParams = () => new URLSearchParams();`,
    './client-form': `export const ClientForm = () => null;`,
    './contract-select': `export const ContractSelect = () => null;`,
    'next/link': `import React from 'react'; export default function Link({ children, ...props }) { return React.createElement('a', props, children) }`,
    '@/components/DynamicDialogFields': `export const DynamicDialogFields = () => null;`,
  }
  const result = await build({
    stdin: { contents: `
      import React, { useState, useCallback } from 'react';
      import { createRoot } from 'react-dom/client';
      import { doc, getDocFromServer, disableNetwork, enableNetwork } from 'firebase/firestore';
      import { db } from './lib/firebase/config';
      import { useTicketClient } from './hooks/use-ticket-client';
      import { resolveTicketLiveDisplay } from './lib/work-documents/ticket-live-display';
      import { TicketContactDetails } from './components/ticket-contact-details';
      import { TicketClientInformation, TicketClientReadStatus } from './components/ticket-client-information';
      import { useClientWorks } from './hooks/use-client-works';
      import { useWorkClients } from './hooks/use-work-clients';
      import { createTicketListDisplays } from './lib/work-documents/ticket-list-display';
      import { loadDocumentClientSnapshot } from './lib/work-documents/load-document-client';
      import { buildOfferVersionPdfInput } from './lib/work-documents/offer-pdf-input';
      import { OfferEditorDialog } from './app/dashboard/lucrari/[id]/offer-editor-dialog';
      import { DevizEditorDialog } from './app/dashboard/lucrari/[id]/deviz-editor-dialog';
      const initialProducts = [{ id: 'product', name: 'Piesă test', quantity: 1, price: 100, total: 100 }];
      function PhaseTwo() {
        const [selected, setSelected] = useState({ id: 'phase2-c', nume: 'Client faza 2' });
        const [works, setWorks] = useState([]), [editor, setEditor] = useState('');
        const associated = useClientWorks(selected);
        const clients = useWorkClients(works);
        window.phase2 = { associated, clients, setSelected, setWorks, setEditor,
          displays: Object.fromEntries(createTicketListDisplays(works, clients.clients)),
          snapshot: loadDocumentClientSnapshot, pdf: buildOfferVersionPdfInput };
        return <><h1>Verificare liste și documente</h1><pre>{JSON.stringify(associated.works.map(w => w.id).sort())}</pre>
          {editor === 'offer' && <OfferEditorDialog lucrareId="phase2-w" open initialProducts={initialProducts} onOpenChange={() => setEditor('')} />}
          {editor === 'deviz' && <DevizEditorDialog lucrareId="phase2-w" open initialProducts={initialProducts} onOpenChange={() => setEditor('')} />}</>;
      }
      import { LucrareForm } from './components/lucrare-form';
      function Details({ work, role }) {
        const result = useTicketClient(work, 'browser-test');
        const display = resolveTicketLiveDisplay(work || {}, result.client);
        window.readState = { result, display };
        return <><h1>{display.identity.name}</h1>
          <TicketClientReadStatus unavailable={result.unavailable} issues={display.issues} />
          <section id="contact"><TicketContactDetails work={work || {}} display={display.contact} /></section>
          <section id="identity"><TicketClientInformation identity={display.identity} showRegistration={role === 'admin' || role === 'dispecer'} /></section></>;
      }
      function App() {
        const [phaseTwo, setPhaseTwo] = useState(false);
        window.showPhaseTwo = () => setPhaseTwo(true);
        const [work, setWork] = useState(${JSON.stringify(work)}), [role, setRole] = useState('admin');
        const [visible, setVisible] = useState(true), [form, setForm] = useState(null), [date, setDate] = useState(new Date('2026-09-27T10:00:00Z'));
        const change = useCallback((field, value) => setForm(prev => ({ ...prev, [field]: value })), []);
        window.api = { setWork, setRole, setVisible, form: () => form, work: () => work,
          open: async id => { setWork(null); const s = await getDocFromServer(doc(db, 'lucrari', id)); setWork(s.data()); },
          disableNetwork: () => disableNetwork(db), enableNetwork: () => enableNetwork(db) };
        if (phaseTwo) return <PhaseTwo />;
        return <main>{visible && <Details work={work} role={role} />}
          <button onClick={() => setForm(structuredClone(work))}>Editează tichetul</button>
          {form && <LucrareForm isEdit preserveContactDraft formData={form} initialData={form}
            dataEmiterii={date} setDataEmiterii={setDate} dataInterventie={date} setDataInterventie={setDate}
            handleInputChange={e => change(e.target.id, e.target.value)} handleSelectChange={change} handleCustomChange={change} handleTehnicieniChange={() => {}} />}
        </main>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
    plugins: [{ name: 'demo-display-services', setup(builder) {
      builder.onResolve({ filter: /^firebase\/firestore$/ }, args => ['/hooks/use-ticket-client.ts', '/hooks/use-work-clients.ts', '/hooks/use-client-works.ts'].some(p => args.importer.endsWith(p)) ? { path: args.path, namespace: 'observed-firestore' } : undefined)
      builder.onLoad({ filter: /.*/, namespace: 'observed-firestore' }, () => ({ contents: `
        export * from 'firebase/firestore';
        import { onSnapshot as original } from 'firebase/firestore';
        export const onSnapshot = (...args) => {
          const m = window.metrics ||= { started: 0, active: 0, maximum: 0 };
          m.started++; m.active++; m.maximum = Math.max(m.maximum, m.active);
          const stop = original(...args); let stopped = false;
          return () => { if (!stopped) { stopped = true; m.active--; stop(); } };
        };`, loader: 'js', resolveDir: root }))
      builder.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined)
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: root }))
      builder.onLoad({ filter: /lib\/firebase\/config\.ts$/ }, () => ({ contents: `
        import { initializeApp } from 'firebase/app';
        import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
        import { getAuth } from 'firebase/auth';
        const app = initializeApp({ projectId: '${projectId}', apiKey: 'demo', authDomain: 'localhost' });
        const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8281);
        const auth = getAuth(app); const storage = null, functions = null;
        export { app, db, auth, storage, functions }; export default app;
      `, loader: 'js', resolveDir: root }))
    } }],
  })
  const server = createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); return }
    res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><meta charset="utf-8"><title>Date actuale tichet — test izolat</title><style>body{font-family:sans-serif;margin:24px;max-width:1000px}section{display:flex;gap:40px;margin:24px 0}button,input{padding:8px;margin:5px}svg{width:16px;height:16px}[role=status]{color:#92400e}</style><div id="root"></div><script src="/bundle.js"></script></html>')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  if (process.argv.includes('--serve')) { console.log(`DISPLAY_TEST_URL=${url}`); return }
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    const errors = [], requests = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort() })
    await page.goto(url)
    await page.waitForFunction(() => window.readState?.result.client?.id === 'c')
    const initial = await page.evaluate(() => window.readState.result.initialClient)
    for (const role of ['admin', 'dispecer', 'tehnician']) {
      await page.evaluate(role => window.api.setRole(role), role)
      await expect(page.getByText('Nr. ordine ONRC:')).toHaveCount(role === 'tehnician' ? 0 : 1)
      await expect(page.getByRole('link', { name: 'Apelează Contact', exact: true })).toHaveAttribute('href', 'tel:200')
    }
    await page.evaluate(() => window.api.setRole('admin'))
    await page.getByRole('button', { name: 'Editează tichetul' }).click()
    await page.getByLabel('Telefon contact tichet', { exact: true }).fill('777')
    await expect(page.getByLabel('Telefon contact tichet', { exact: true })).toHaveValue('777')
    const draft = await page.evaluate(() => window.api.form())
    const current = structuredClone(client)
    current.nume = 'Client actual'; current.telefon = '101'
    current.locatii[0].adresa = 'Adresă actuală'
    Object.assign(current.locatii[0].persoaneContact[0], { telefon: '300', email: 'actual@example.test' })
    await db.doc('clienti/c').set(current)
    await expect(page.getByRole('heading', { name: 'Client actual', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Scrie email către actual@example.test', exact: true })).toHaveAttribute('href', 'mailto:actual@example.test')
    await expect(page.getByRole('link', { name: 'Apelează Contact', exact: true })).toHaveAttribute('href', 'tel:300')
    await expect(page.getByRole('link', { name: 'Google Maps', exact: true })).toHaveAttribute('href', /Adres%C4%83%20actual%C4%83/)
    assert.deepEqual(await page.evaluate(() => window.readState.result.initialClient), initial)
    assert.deepEqual(await page.evaluate(() => window.api.form()), draft)
    assert.deepEqual(await page.evaluate(() => window.api.work()), work)
    assert.deepEqual(await page.evaluate(() => window.metrics), { started: 1, active: 1, maximum: 1 })
    console.log('PASS live client update, phone/email/maps, role presentation, one subscription, unchanged draft/document fallback')
    await page.getByRole('button', { name: 'Preia datele actuale ale contactului', exact: true }).click()
    await expect(page.getByLabel('Telefon contact tichet', { exact: true })).toHaveValue('300')
    await expect(page.getByLabel('Email contact tichet', { exact: true })).toHaveValue('actual@example.test')
    assert.equal(await page.evaluate(() => window.api.form().contactSync.values.telefon), '300')
    assert.deepEqual(await page.evaluate(() => window.api.work()), work)
    console.log('PASS explicit contact confirmation changes only the edit draft and records its baseline')

    const manual = { ...work, telefon: '999', persoanaContactEmail: '' }
    await page.evaluate(work => window.api.setWork(work), manual)
    await expect(page.getByRole('link', { name: 'Apelează Contact', exact: true })).toHaveAttribute('href', 'tel:999')
    await expect(page.locator('#contact a[href^="mailto:"]')).toHaveCount(0)
    await expect(page.getByText('Date păstrate pentru verificare:')).toBeVisible()
    await page.evaluate(work => window.api.setWork({ ...work, statusLucrare: 'Arhivată' }), work)
    await expect(page.getByRole('heading', { name: 'Client inițial', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Apelează Contact', exact: true })).toHaveAttribute('href', 'tel:200')
    console.log('PASS manual/blank overrides and archived display')

    await page.evaluate(() => window.api.open('w2'))
    await page.waitForFunction(() => window.readState?.result.client?.id === 'c2')
    await expect(page.getByRole('heading', { name: 'Client secundar', exact: true })).toBeVisible()
    assert.equal(await page.evaluate(() => window.metrics.maximum), 1)
    await page.evaluate(work => window.api.setWork({ ...work, id: 'missing', clientId: 'missing' }), work)
    await expect(page.getByText('Datele actuale ale clientului nu sunt disponibile.', { exact: false })).toBeVisible()
    assert.equal(await page.evaluate(() => window.readState.result.client), null)
    await page.evaluate(work => window.api.setWork({ ...work, id: 'denied', clientId: 'denied' }), work)
    await expect(page.getByText('Datele actuale ale clientului nu sunt disponibile.', { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Apelează Contact', exact: true })).toHaveAttribute('href', 'tel:200')
    console.log('PASS navigation, missing ID without name fallback, permission-denied fallback')

    await db.doc('clienti/legacy').set({ ...client, id: 'legacy', nume: 'Client legacy unic' })
    const legacy = { ...structuredClone(work), id: 'legacy-work', client: 'Client legacy unic' }
    delete legacy.clientId; delete legacy.locationId; delete legacy.contactId; delete legacy.contactSync
    await page.evaluate(work => window.api.setWork(work), legacy)
    await page.waitForFunction(() => window.readState?.result.client?.id === 'legacy')
    assert.deepEqual(await page.evaluate(() => window.api.work()), legacy)
    await db.doc('clienti/legacy-duplicate').set({ ...client, id: 'legacy-duplicate', nume: 'Client legacy unic' })
    await page.evaluate(work => window.api.setWork({ ...work, id: 'ambiguous-work' }), legacy)
    await expect(page.getByText('Datele actuale ale clientului nu sunt disponibile.', { exact: false })).toBeVisible()
    assert.equal(await page.evaluate(() => window.readState.result.client), null)
    console.log('PASS unique legacy association without backfill and ambiguous legacy fallback')

    await page.evaluate(work => window.api.setWork(work), work)
    await page.waitForFunction(() => window.readState?.result.client?.id === 'c')
    const deleted = structuredClone(current); deleted.locatii[0].persoaneContact = []
    await db.doc('clienti/c').set(deleted)
    await expect(page.getByText('Contactul nu poate fi identificat sigur.', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Client actual', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Apelează Contact', exact: true })).toHaveAttribute('href', 'tel:200')
    await page.evaluate(() => window.api.disableNetwork())
    await expect(page.getByText('Datele actuale ale clientului nu sunt disponibile.', { exact: false })).toBeVisible()
    await page.evaluate(() => window.api.enableNetwork())
    await page.waitForFunction(() => window.readState?.result.client?.id === 'c')
    await db.doc('clienti/c').delete()
    await expect(page.getByText('Datele actuale ale clientului nu sunt disponibile.', { exact: false })).toBeVisible()
    console.log('PASS deleted contact, offline/reconnect, deleted client')

    await page.screenshot({ path: path.join(tmpdir(), 'fom-ticket-live-display.png'), fullPage: true })
    await page.evaluate(() => window.api.setVisible(false))
    await page.waitForFunction(() => window.metrics.active === 0)
    for (const snapshot of before.docs) {
      const after = await snapshot.ref.get()
      assert.deepEqual(after.data(), snapshot.data())
      assert.ok(after.updateTime.isEqual(snapshot.updateTime), 'Display must not write the work')
    }
    assert.equal((await db.collection('clientContactSyncJobs').get()).size, 0)
    assert.equal((await db.collection('clientContactSyncIssues').get()).size, 0)
    assert.deepEqual(requests, [])
    assert.deepEqual(errors, [])
    console.log('PASS unsubscribe on unmount, unchanged Firestore works/updateTime, no jobs/issues/email requests or browser errors')

    // Phase 2 uses different records, explicit-save permissions and no external requests.
    const pclient = { ...structuredClone(client), id: 'phase2-c', nume: 'Client faza 2', cui: 'RO-FRESH', adresa: 'Sediu nou' }
    const pwork = { ...structuredClone(work), id: 'phase2-w', clientId: pclient.id, client: pclient.nume,
      preluatDispecer: true, products: [{ id: 'product', name: 'Piesă test', quantity: 1, price: 100, total: 100 }],
      offerVersions: [], clientInfo: { ...work.clientInfo, cui: 'RO-OLD' },
      contactSync: { ...work.contactSync, clientId: pclient.id, values: { ...work.contactSync.values, client: pclient.nume } } }
    await db.doc('clienti/phase2-c').set(pclient)
    await db.doc('lucrari/phase2-w').set(pwork)
    await db.doc('lucrari/phase2-legacy').set({ client: pclient.nume })
    await db.doc('lucrari/phase2-nested').set({ client: 'Vechi', clientInfo: { id: pclient.id } })
    await db.doc('lucrari/phase2-wrong').set({ clientId: 'missing', client: pclient.nume })
    await page.evaluate(() => window.showPhaseTwo())
    await page.waitForFunction(() => window.phase2?.associated.works.length === 3)
    assert.deepEqual(await page.evaluate(() => window.phase2.associated.works.map(w => w.id).sort()), ['phase2-legacy', 'phase2-nested', 'phase2-w'])
    await page.evaluate(work => window.phase2.setWorks(Array.from({ length: 100 }, (_, i) => ({ ...work, id: String(i) }))), pwork)
    await page.waitForFunction(() => window.phase2.clients.clients.length === 1)
    const started = await page.evaluate(() => window.metrics.started)
    await page.evaluate(work => window.phase2.setWorks(Array.from({ length: 200 }, (_, i) => ({ ...work, id: String(i) }))), pwork)
    await page.waitForFunction(() => Object.keys(window.phase2.displays).length === 200)
    assert.equal(await page.evaluate(() => window.metrics.started), started, 'More rows sharing the client must not create more reads')
    await db.doc('clienti/phase2-c').update({ nume: 'Client faza 2 redenumit', cui: 'RO-LIVE' })
    await page.waitForFunction(() => window.phase2.displays['0'].client === 'Client faza 2 redenumit')
    await page.evaluate(() => window.phase2.setSelected({ id: 'phase2-c', nume: 'Client faza 2 redenumit' }))
    await page.waitForFunction(() => window.phase2.associated.works.length === 2)
    // Legacy copy cannot follow a rename without an ID. It is deliberately not guessed.
    await db.doc('lucrari/phase2-legacy').update({ client: 'Client faza 2 redenumit' })
    await page.waitForFunction(() => window.phase2.associated.works.length === 3)
    await db.doc('clienti/phase2-duplicate').set({ id: 'phase2-duplicate', nume: 'Client faza 2 redenumit' })
    await page.waitForFunction(() => window.phase2.associated.works.length === 2)
    await db.doc('clienti/phase2-duplicate').delete()
    await page.waitForFunction(() => window.phase2.associated.works.length === 3)
    const loadedSnapshot = await page.evaluate(work => window.phase2.snapshot(work), pwork)
    assert.equal(loadedSnapshot.clientInfo.cui, 'RO-LIVE')
    assert.equal(loadedSnapshot.client, 'Client faza 2 redenumit')
    const missing = await page.evaluate(async work => { try { await window.phase2.snapshot({ ...work, clientId: 'missing' }); return false } catch { return true } }, pwork)
    assert.equal(missing, true)
    assert.deepEqual((await db.doc('lucrari/phase2-w').get()).data(), pwork, 'All list/loader operations are read-only')
    console.log('PASS scoped client works, ID rename, ambiguous legacy removal, deduplicated list subscriptions, fresh read-only document loader')

    await page.unroute('**/api/**')
    await page.route('**/api/**', route => {
      requests.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    })
    await page.evaluate(() => window.phase2.setEditor('offer'))
    await expect(page.getByRole('button', { name: 'Salvează', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Salvează', exact: true }).click()
    await expect.poll(async () => (await db.doc('lucrari/phase2-w').get()).data().offerVersions.length).toBe(1)
    const savedOffer = (await db.doc('lucrari/phase2-w').get()).data().offerVersions[0]
    assert.equal(savedOffer.clientSnapshot.clientInfo.cui, 'RO-LIVE')
    await db.doc('clienti/phase2-c').update({ cui: 'RO-NEXT' })
    const frozenPdf = await page.evaluate(({ work, version }) => window.phase2.pdf({ lucrareId: work.id, work, version, versionNumber: 1, fallbackVatPercent: 21 }), { work: pwork, version: savedOffer })
    assert.equal(frozenPdf.beneficiar.cui, 'RO-LIVE')
    await page.evaluate(() => window.phase2.setEditor('deviz'))
    await expect(page.getByRole('button', { name: 'Salvează', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Salvează', exact: true }).click()
    await expect.poll(async () => (await db.doc('lucrari/phase2-w').get()).data().devizVersions?.length).toBe(1)
    const saved = (await db.doc('lucrari/phase2-w').get()).data()
    assert.equal(saved.devizClientSnapshot.clientInfo.cui, 'RO-NEXT')
    assert.equal(saved.offerVersions[0].clientSnapshot.clientInfo.cui, 'RO-LIVE')
    assert.equal(saved.clientInfo.cui, 'RO-OLD', 'Document generation must not rewrite the work identity')
    assert.equal(requests.some(url => /send-email|api\/offer\?/.test(url)), false)
    assert.deepEqual(errors, [])
    console.log('PASS real offer/deviz dialogs save frozen per-version identities, historic PDF input stays frozen, raw ticket unchanged, no email sent')
    await page.evaluate(() => window.phase2.setEditor(''))
    await db.doc('lucrari/phase2-w').update({ statusOferta: 'OFERTAT' })
    await page.evaluate(() => window.phase2.setEditor('offer'))
    await page.getByRole('button', { name: 'Începe versiune nouă', exact: true }).click()
    await page.getByRole('button', { name: 'Salvează', exact: true }).click()
    await expect.poll(async () => (await db.doc('lucrari/phase2-w').get()).data().offerVersions.length).toBe(2)
    const versionsAfter = (await db.doc('lucrari/phase2-w').get()).data().offerVersions
    assert.equal(versionsAfter[0].clientSnapshot.clientInfo.cui, 'RO-LIVE')
    assert.equal(versionsAfter[1].clientSnapshot.clientInfo.cui, 'RO-NEXT')
    await page.evaluate(() => { window.phase2.setEditor(''); window.phase2.setSelected(null) })
    await page.waitForFunction(() => window.phase2.associated.works.length === 0)
    const manyWorks = Array.from({ length: 61 }, (_, i) => ({ id: 'batch-w' + i, clientId: 'batch-c' + i }))
    const batch = db.batch()
    for (let i = 0; i < 61; i++) batch.set(db.doc('clienti/batch-c' + i), { nume: 'Client lot ' + i })
    await batch.commit()
    const beforeBatch = await page.evaluate(() => window.metrics.started)
    await page.evaluate(works => window.phase2.setWorks(works), manyWorks)
    await page.waitForFunction(() => window.phase2.clients.clients.length === 61)
    assert.equal(await page.evaluate(() => window.metrics.started), beforeBatch + 3)
    assert.equal(await page.evaluate(() => window.metrics.active), 3)
    await page.evaluate(works => window.phase2.setWorks([...works, { id: 'malformed', clientId: 'invalid/path' }]), manyWorks)
    await page.waitForFunction(() => window.phase2.clients.clients.length === 61 && window.phase2.clients.unavailable)
    await page.evaluate(() => window.phase2.setWorks([]))
    await page.waitForFunction(() => window.metrics.active === 0)
    assert.deepEqual(errors, [])
    console.log('PASS unchanged-products new version, 61 clients in three grouped subscriptions, invalid ID fallback, full cleanup')

    await page.goto('about:blank')

  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
    await db.terminate()
  }
}
