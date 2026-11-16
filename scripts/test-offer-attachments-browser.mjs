/** Isolated browser regression: real dialogs and recipient code, simulated external services. */
import { build } from 'esbuild'
import { chromium } from '@playwright/test'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const root = process.cwd()
const mocks = {
  "@/lib/firebase/config": `export const db = null; export const auth = { currentUser: null }; export const storage = null;`,
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
  '@/contexts/AuthContext': `export const useAuth = () => ({ user: { uid: 'test' }, userData: { uid: 'test', displayName: 'Test', role: 'admin' } });`,
  '@/hooks/use-toast': `export const toast = (value) => { window.fixture.toasts.push(value); }; export const useToast = () => ({ toast });`,
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
Object.assign(mocks, {
  'firebase/storage': `export const ref = (_, path) => ({ path }); export const uploadBytesResumable = (_, file) => ({ on(event, progress, reject, done) { progress({ bytesTransferred: 0, totalBytes: file.size }); setTimeout(() => { if(window.fixture.uploadFailure) return reject(new Error('Încărcare eșuată simulată')); progress({ bytesTransferred: file.size, totalBytes: file.size }); done() }, 300) } });`,
  'next/navigation': `export const useParams = () => ({ id: 'opportunity' });`,
  'next/link': `export default function Link({children, ...props}) { return <a {...props}>{children}</a> }`,
  '@/components/crm': `export { Panel } from '@/components/crm/panel';`,
  '@/components/offer/offer-evidence-panel': `export const OfferEvidencePanel = () => null;`,
  '@/hooks/use-crm-opportunity': `export const useCrmOpportunity = () => ({ opportunity: window.fixture.opportunity, loading: false });`,
  '@/lib/crm/opportunities': `export const getCrmClientById = async () => ({ name: 'Client Demo' }); export const listCrmClientContacts = async () => [{ id: 'contact', name: 'Contact Demo', email: 'client@example.test' }];`,
  '@/lib/crm/offers': `export class CrmOfferValidationError extends Error {}; export const listCrmOffers = async () => structuredClone(window.fixture.offers); export const deleteCrmOfferDraft = async () => {}; export const saveCrmOfferDraft = async input => { const id = input.offerId || 'draft-test'; const row = { ...input, id, status: 'DRAFT', version: 1 }; const index = window.fixture.offers.findIndex(o => o.id === id); if(index < 0) window.fixture.offers.push(row); else window.fixture.offers[index] = row; return id; }; export const issueCrmOffer = async input => { window.fixture.issued = input; throw new Error('SMTP indisponibil simulat') };`,
  '@/lib/crm/storage/provider': `export const crmStorageProvider = { uploadOpportunityFile: async ({file}) => ({ path: 'pdf', url: 'https://example.test/pdf', filename: file.name, mime: file.type, size: file.size }) };`,
  '@/lib/crm/technician-client': `export const downloadTechnicianCrmFile = async () => {};`,
})
const result = await build({ stdin: { contents: `
import React from 'react'; import { createRoot } from 'react-dom/client';
import { OfferEditorDialog } from './app/dashboard/lucrari/[id]/offer-editor-dialog';
import OpportunityOffersPage from './app/crm/opportunities/[id]/offers/page';
const products = [{ id: 'p', name: 'Barieră acces', quantity: 1, price: 100, total: 100, um: 'buc' }];
const conditions = ['Plata: avans', 'Livrare: 2 zile', 'Instalare: 1 zi'];
window.fixture = { work: { id: 'ticket', clientId: 'client', locationId: 'location', client: 'Demo', locatie: 'Locație', preluatDispecer: true, products, conditiiOferta: conditions, offerVersions: [{ savedAt:'2026-11-15T10:00:00Z', products, total:100, vatPercent:21, adjustmentPercent:0, conditions }] }, client: { id: 'client', nume: 'Demo', locatii:[{ id:'location', nume:'Locație', persoaneContact:[{nume:'Contact', email:'client@example.test'}]}] }, opportunity: { id:'opportunity', code:'OP.36', title:'Înlocuire barieră', clientId:'client', ownerId:'test', pipelineStage:'OFERTA_TRANSMISA', opportunityType:'OFERTE' }, offers: [{id:'draft-test', version:1, status:'DRAFT', subject:'Ofertă OP.36', message:'Bună ziua', snapshot:{ products, optionalProducts:[], conditions, vatPercent:21, adjustmentPercent:0, validityText:'30 zile', comments:'', subtotal:100, total:100 }}], reads:[], writes:[], toasts:[], generatedInputs:[] };
function Ticket() { const [open,setOpen] = React.useState(true); return <><button onClick={()=>setOpen(true)}>Redeschide oferta</button><OfferEditorDialog lucrareId='ticket' open={open} onOpenChange={setOpen} initialProducts={products}/></> }
createRoot(document.getElementById('root')).render(location.search.includes('crm') ? <OpportunityOffersPage/> : <Ticket/>);
`, loader: 'tsx', resolveDir: root }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', tsconfig: path.join(root, 'tsconfig.json'), define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'adapters', setup(b) {
  b.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'mock' } : undefined)
  b.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'tsx', resolveDir: root }))
} }] })
const server = createServer((req, res) => {
  if(req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript'); return res.end(result.outputFiles[0].text) }
  if(req.url === '/styles.css') { res.setHeader('Content-Type','text/css'); return res.end(readFileSync('/tmp/fom-attachments-browser.css')) }
  res.end('<!doctype html><html><head><link rel="stylesheet" href="/styles.css"/></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>')
})
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
const browser = await chromium.launch({ headless:true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' })
try {
  for(const kind of ['ticket','crm']) {
    const page = await browser.newPage({viewport:{width:1440,height:1000}})
    const errors=[]; page.on('pageerror',error=>errors.push(error.message))
    const permits = new Map(); const calls=[]
    await page.route('**/api/**', async route => {
      const req=route.request(); const data=req.postDataJSON(); calls.push({url:req.url(),data})
      if(req.url().endsWith('/api/offer/attachments')) {
        if(data.action==='initiate') { const file={id:`attachment-${permits.size+1}`,filename:data.filename,size:data.size,contentType:'application/pdf',path:'simulated'}; permits.set(file.id,file); return route.fulfill({json:file}) }
        return route.fulfill({json:permits.get(data.id)})
      }
      return route.fulfill({json:{success:true,acceptUrl:'https://example.test/accept',rejectUrl:'https://example.test/reject'}})
    })
    await page.goto(`http://127.0.0.1:${server.address().port}/?${kind}`)
    if(kind==='crm') await page.getByTestId('offer-load-draft-draft-test').click()
    else await page.getByText('client@example.test',{exact:true}).waitFor()
    const files=page.locator('input[type=file]')
    await files.setInputFiles([{name:'Fișă tehnică.pdf',mimeType:'application/pdf',buffer:Buffer.from('technical')},{name:'Desen.dwg',mimeType:'application/octet-stream',buffer:Buffer.from('drawing')}])
    await page.getByRole('status').waitFor()
    assert.equal(await page.getByRole('button',{name:kind==='crm'?'Emite ofertă':'Trimite ofertă',exact:true}).isDisabled(),true)
    await page.getByRole('button',{name:'Desen.dwg',exact:true}).waitFor()
    await page.getByRole('status').waitFor({state:'hidden'})
    await page.getByRole('button',{name:'Elimină Desen.dwg',exact:true}).click()
    await page.getByRole('button',{name:kind==='crm'?'Salvează draft':'Salvează',exact:true}).click()
    if(kind==='crm') await page.waitForFunction(()=>window.fixture.offers[0].emailAttachments?.length===1)
    else await page.waitForFunction(()=>window.fixture.work.offerVersions.at(-1).emailAttachments?.length===1)
    await page.getByRole('button',{name:kind==='crm'?'Close':'Închide',exact:true}).click()
    await page.getByRole('button',{name:kind==='crm'?'Încarcă draft':'Redeschide oferta',exact:true}).click()
    await page.getByRole('button',{name:'Fișă tehnică.pdf',exact:true}).waitFor()
    await page.getByRole("button",{name:"Atașează fișiere",exact:true}).scrollIntoViewIfNeeded()
    await page.screenshot({animations:"disabled",path:`/tmp/fom-attachments-${kind}.png`,fullPage:true})
    await files.setInputFiles({name:'program.exe',mimeType:'application/octet-stream',buffer:Buffer.from('bad')})
    await page.getByRole('alert').filter({hasText:'format neacceptat'}).waitFor()
    await page.evaluate(()=>window.fixture.uploadFailure=true)
    await files.setInputFiles({name:'Eroare.pdf',mimeType:'application/pdf',buffer:Buffer.from('file')})
    await page.getByRole('alert').filter({hasText:'Încărcare eșuată simulată'}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Fișă tehnică.pdf',exact:true}).count(),1)
    if(kind==='crm') {
      await page.getByRole('button',{name:'Emite ofertă',exact:true}).click()
      await page.waitForFunction(()=>window.fixture.toasts.some(t=>String(t.description).includes('SMTP indisponibil')))
      assert.equal((await page.evaluate(()=>window.fixture.issued.emailAttachments)).length,1)
      await page.getByRole('button',{name:'Close',exact:true}).click()
      await page.getByRole('button',{name:'Ofertă nouă',exact:true}).click()
      assert.equal(await page.getByRole('button',{name:'Fișă tehnică.pdf',exact:true}).count(),0)
    } else {
      await page.getByRole('button',{name:'Trimite ofertă',exact:true}).click()
      await page.waitForFunction(()=>window.fixture.toasts.some(t=>t.title==='Ofertă trimisă'))
      assert.equal(calls.find(c=>c.url.endsWith('/api/offer')).data.snapshot.emailAttachments.length,1)
    }
    assert.deepEqual(errors,[])
    console.log(`PASS ${kind}: multiple files, busy guard, remove, save/reopen, invalid type, upload failure, sending snapshot${kind==='crm'?', send failure retention and new offer reset':''}`)
    await page.close()
  }
} finally { await browser.close(); server.close() }
