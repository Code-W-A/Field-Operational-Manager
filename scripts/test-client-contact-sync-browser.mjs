/** Actual LucrareForm, contact card, server reads and addLucrare against demo emulators. */
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'
import path from 'node:path'
const require = createRequire(new URL('../firebase-functions/package.json', import.meta.url))
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore + Functions demo emulators are required.')
const { initializeApp } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')
initializeApp({ projectId: 'demo-fom-contact-sync' })
const db = getFirestore()
const root = process.cwd()
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
const configMock = `
  import { initializeApp } from 'firebase/app';
  import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
  import { getAuth } from 'firebase/auth';
  const app = initializeApp({ projectId: 'demo-fom-contact-sync', apiKey: 'demo', authDomain: 'localhost' });
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8180);
  const auth = getAuth(app); const storage = null, functions = null;
  export { app, db, auth, storage, functions }; export default app;
`
const result = await build({
  stdin: { contents: `
    import React, { useEffect, useState, useCallback } from 'react';
    import { createRoot } from 'react-dom/client';
    import { doc, getDocFromServer, onSnapshot, disableNetwork, enableNetwork } from 'firebase/firestore';
    import { db } from './lib/firebase/config';
    import { LucrareForm } from './components/lucrare-form';
    import { TicketContactDetails } from './components/ticket-contact-details';
    import { prepareReinterventionContact } from './lib/work-documents/live-ticket-contact';
    import { addLucrare } from './lib/firebase/firestore';
    function App() {
      const [work, setWork] = useState(null), [client, setClient] = useState(null), [form, setForm] = useState(null);
      const [message, setMessage] = useState(''), [date, setDate] = useState(new Date('2026-09-20T10:00:00Z'));
      const change = useCallback((key, value) => setForm(prev => ({ ...prev, [key]: value })), []);
      useEffect(() => {
        const a = onSnapshot(doc(db, 'lucrari', 'browser-active'), s => setWork(s.data()));
        const b = onSnapshot(doc(db, 'clienti', 'browser-client'), s => setClient({ ...s.data(), id: s.id }));
        return () => { a(); b(); };
      }, []);
      const open = async () => {
        setMessage(''); setForm(null);
        try {
          const old = (await getDocFromServer(doc(db, 'lucrari', 'browser-archive'))).data();
          setForm({ ...await prepareReinterventionContact(old), tipLucrare: 'Re-Intervenție', tehnicieni: [],
            echipament: old.echipament, echipamentId: old.echipamentId, descriere: '', defectReclamatHistory: old.defectReclamatHistory,
            lucrareOriginala: 'browser-archive', statusLucrare: 'Listată', statusFacturare: 'Nefacturat' });
        } catch (e) { setMessage(e.message); }
      };
      const save = async () => {
        setMessage(''); window.saved = null;
        try {
          window.saved = await addLucrare({ ...form, dataEmiterii: date.toISOString(), dataInterventie: date.toISOString() });
          setMessage('Creat: ' + window.saved.id);
        } catch (e) { setMessage(e.message); }
      };
      window.api = { disableNetwork: () => disableNetwork(db), enableNetwork: () => enableNetwork(db), form: () => form };
      return <main><h1>Verificare sincronizare contacte</h1>{work && <div style={{ display: 'flex', gap: 40 }}><TicketContactDetails work={work} client={client} /></div>}
        <button onClick={open}>Creează reintervenție</button>
        {form && <><LucrareForm isReintervention={true} formData={form} initialData={form}
          dataEmiterii={date} setDataEmiterii={setDate} dataInterventie={date} setDataInterventie={setDate}
          handleInputChange={e => change(e.target.id, e.target.value)} handleSelectChange={change} handleCustomChange={change} handleTehnicieniChange={() => {}} />
          <button onClick={save}>Salvează reintervenția</button></>}
        <p role="status">{message}</p></main>;
    }
    createRoot(document.getElementById('root')).render(<App />);
  `, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"test"', 'process.env': '{}' },
  plugins: [{ name: 'demo-services', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined)
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'js', resolveDir: root }))
    builder.onLoad({ filter: /lib\/firebase\/config\.ts$/ }, () => ({ contents: configMock, loader: 'js', resolveDir: root }))
  } }],
})
const contact = { id: 'p', nume: 'Admin', telefon: '200', email: 'support@marf.ro' }
const originalClient = { nume: 'Browser MARF', locatii: [{ id: 'l', nume: 'Avangarde', adresa: 'Adresa veche', persoaneContact: [contact], echipamente: [{ id: 'e', nume: 'Bariera', cod: 'E1' }] }] }
const originalWork = { clientId: 'browser-client', locationId: 'l', contactId: 'p', client: 'Browser MARF', locatie: 'Avangarde', persoanaContact: 'Admin', telefon: '200', persoanaContactEmail: 'support@marf.ro',
  statusLucrare: 'Listată', echipament: 'Bariera', echipamentId: 'e', defectReclamatHistory: ['Defect anterior'], clientInfo: { locationAddress: 'Adresa veche' } }
await db.doc('clienti/browser-client').set(originalClient)
await db.doc('lucrari/browser-active').set(originalWork)
await db.doc('lucrari/browser-archive').set({ ...originalWork, statusLucrare: 'Arhivată', archivedAt: '2026-09-10' })
const archive = (await db.doc('lucrari/browser-archive').get()).data()
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(result.outputFiles[0].text); return }
  res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><meta charset="utf-8"><title>Contact sync demo</title><style>body{font-family:sans-serif;margin:24px}button,input{padding:8px;margin:5px}svg{width:16px;height:16px}</style><div id="root"></div><script src="/bundle.js"></script></html>')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
if (process.argv.includes('--serve')) { console.log(url) }
else {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } })
    page.on('pageerror', error => console.error('Browser error:', error.message))
    page.on('dialog', dialog => dialog.accept())
    const emailRequests = []
    await page.route('**/api/**', route => { emailRequests.push(route.request().url()); return route.abort() })
    await page.goto(url)
    await page.getByRole('link', { name: 'Scrie email către support@marf.ro' }).waitFor()
    let current = structuredClone(originalClient)
    current.locatii[0].adresa = 'Adresa noua'
    Object.assign(current.locatii[0].persoaneContact[0], { email: 'suport@marf.ro', telefon: '300' })
    await db.doc('clienti/browser-client').set(current)
    await page.getByRole('link', { name: 'Scrie email către suport@marf.ro' }).waitFor()
    assert.equal(await page.getByRole('link', { name: 'Apelează Admin' }).getAttribute('href'), 'tel:300')
    assert.match(await page.getByRole('link', { name: 'Google Maps' }).getAttribute('href'), /Adresa%20noua/)
    console.log('PASS browser: client edit → Functions → ticket → current phone/email/map links')

    await page.getByRole('button', { name: 'Creează reintervenție', exact: true }).click()
    await page.getByLabel('Email contact tichet', { exact: true }).waitFor()
    assert.equal(await page.getByLabel('Email contact tichet', { exact: true }).inputValue(), 'suport@marf.ro')
    assert.equal(await page.getByLabel('Telefon contact tichet', { exact: true }).inputValue(), '300')
    current.locatii[0].persoaneContact[0].email = 'changed-after-open@marf.ro'
    current.locatii[0].persoaneContact[0].telefon = '400'
    await db.doc('clienti/browser-client').set(current)
    await page.getByRole('button', { name: 'Salvează reintervenția', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Creat:' }).waitFor()
    const saved = await page.evaluate(() => window.saved)
    assert.equal(saved.persoanaContactEmail, 'changed-after-open@marf.ro'); assert.equal(saved.telefon, '400')
    assert.equal(saved.contactId, 'p'); assert.equal(saved.lucrareOriginala, 'browser-archive'); assert.equal(saved.echipamentId, 'e')
    assert.deepEqual(saved.defectReclamatHistory, ['Defect anterior'])
    assert.deepEqual((await db.doc('lucrari/browser-archive').get()).data(), archive)
    console.log('PASS actual form + addLucrare: refresh at save, stable IDs, equipment/history/original archive preserved')

    await page.getByRole('button', { name: 'Creează reintervenție', exact: true }).click()
    await page.getByLabel('Telefon contact tichet', { exact: true }).waitFor()
    await page.waitForFunction(() => window.api.form()?.telefon === '400')
    await page.getByLabel('Telefon contact tichet', { exact: true }).fill('0777000000')
    current.locatii[0].persoaneContact[0].telefon = '500'; await db.doc('clienti/browser-client').set(current)
    await page.getByRole('button', { name: 'Salvează reintervenția', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Creat:' }).waitFor()
    assert.equal(await page.evaluate(() => window.saved.telefon), '0777000000')
    console.log('PASS explicit exception entered in new form survives save refresh')

    const count = (await db.collection('lucrari').get()).size
    await page.evaluate(() => window.api.disableNetwork())
    await page.getByRole('button', { name: 'Salvează reintervenția', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'nu a fost creată' }).waitFor()
    assert.equal((await db.collection('lucrari').get()).size, count)
    await page.evaluate(() => window.api.enableNetwork())
    current.locatii[0].persoaneContact = []
    await db.doc('clienti/browser-client').set(current)
    await page.getByRole('button', { name: 'Salvează reintervenția', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Selectați contactul actual' }).waitFor()
    assert.equal((await db.collection('lucrari').get()).size, count)
    assert.deepEqual(emailRequests, [])
    console.log('PASS offline/deleted contact blocks creation; no API/email request')

    current.locatii[0].persoaneContact = [{ ...contact, telefon: '500', email: 'first@marf.ro' }, { ...contact, id: 'p2', telefon: '600', email: 'second@marf.ro' }]
    await db.doc('clienti/browser-client').set(current)
    const ambiguous = { ...archive }; delete ambiguous.contactId
    await db.doc('lucrari/browser-archive').set(ambiguous)
    await page.getByRole('button', { name: 'Creează reintervenție', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: 'Selectați locația și contactul' }).waitFor()
    await page.getByRole('button', { name: 'Salvează reintervenția', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Selectați explicit' }).waitFor()
    assert.equal((await db.collection('lucrari').get()).size, count)
    await page.locator('#locatie').click()
    await page.getByRole('option', { name: 'Avangarde', exact: true }).click()
    await page.locator('#ticket-contact').click()
    await page.getByRole('option', { name: 'Admin — 600 — second@marf.ro', exact: true }).click()
    await page.getByRole('button', { name: 'Salvează reintervenția', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Creat:' }).waitFor()
    assert.equal(await page.evaluate(() => window.saved.contactId), 'p2')
    assert.equal(await page.evaluate(() => window.saved.persoanaContactEmail), 'second@marf.ro')
    console.log('PASS ambiguous legacy association requires explicit location/contact; duplicate names selected by ID')

    await db.doc('lucrari/browser-active').update({ telefon: '0777000000', persoanaContactEmail: '', 'clientInfo.locationAddress': 'Adresă manuală' })
    await page.waitForFunction(() => document.querySelector('a[href="tel:0777000000"]'))
    assert.equal(await page.locator('a[href^="mailto:"]').count(), 0)
    assert.match(await page.getByRole('link', { name: 'Google Maps' }).getAttribute('href'), /Adres%C4%83%20manual%C4%83/)
    await page.screenshot({ path: '/tmp/fom-contact-sync-browser.png', fullPage: true })
    console.log('PASS displayed values and all links respect manual/empty exceptions')
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); await db.terminate() }
}
