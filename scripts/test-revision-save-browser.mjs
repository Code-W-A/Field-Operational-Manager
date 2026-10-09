// Real page, editor and revision persistence adapter; isolated in-memory Firebase/HTTP dependencies.
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const mocks = {
  'next/navigation': `const router = { replace(url) { window.calls.routes.push(url) }, back() { history.back() } }; export const useRouter = () => router; export const useParams = () => ({id:'work',equipmentId:'eq'});`,
  '@/contexts/AuthContext': `export const useAuth = () => ({userData:{uid:'test',role:window.role,displayName:'Test'}});`,
  '@/components/dashboard-shell': `export const DashboardShell = ({children}) => children;`,
  '@/components/dashboard-header': `export const DashboardHeader = () => null;`,
  '@/components/qr-code-scanner': `export const QRCodeScanner = () => null;`,
  '@/hooks/use-toast': `const toast = value => window.calls.toasts.push(value); export const useToast = () => ({toast});`,
  '@/lib/firebase/config': `export const db = {}; export const storage = {};`,
  '@/lib/firebase/firestore': `const work = {client:'Client',locatie:'Sediu',tipLucrare:'Revizie',revision:{equipment:[{equipmentId:'eq',equipmentName:'Ușă',revisionChecklistTemplateId:'root'}]}}; export const getLucrareById = async () => work; export const getClienti = async () => []; export const getClientById = async () => null; export const updateLucrare = async () => {};`,
  '@/firebase-functions/src/client-ticket-sync': `export const isContactSyncEligible = () => false; export const resolveTicketLocation = () => null;`,
  '@/lib/client-work-links': `export const createClientIndex = () => ({resolve:()=>null});`,
  '@/lib/revisions/checklist': `export const subscribeRevisionChecklistFromRoot = (id,cb) => { cb({sections:window.seed.sections}); return ()=>{}; };`,
  '@/lib/technician/client': `export const technicianFile = async file => { window.calls.uploads.push(file.name); return {path:file.name,url:'data:image/png;base64,',fileName:file.name}; }; export const technicianCommand = async (action,id,payload) => { window.calls.commands.push(payload); await window.saveDelay(); if(window.fail) throw Error('Rețea indisponibilă'); window.persist(payload); };`,
  'firebase/firestore': `export const doc = (...args) => args.slice(1).join('/'); export const collection=doc; export const serverTimestamp=()=> 'now'; export const getDocs=async()=>({docs:[]}); const snap=()=>({id:'eq',exists:()=>true,data:()=>window.seed}); export const getDoc=async()=>snap(); export const onSnapshot=(ref,cb)=>{window.snapshot=()=>cb(snap()); window.snapshot(); return ()=>{};}; export const setDoc=async(ref,payload)=>{window.calls.writes.push(payload); await window.saveDelay(); if(window.fail) throw Error('Rețea indisponibilă'); window.persist(payload);}; export const updateDoc=setDoc;`,
  'firebase/storage': `export const ref=(storage,path)=>path; export const uploadBytes=async(path,file)=>{window.calls.uploads.push(file.name);if(window.failPhoto===file.name) throw Error('Încărcare eșuată');}; export const getDownloadURL=async()=> 'data:image/png;base64,'; export const deleteObject=async()=>{}; export const listAll=async()=>({items:[]});`,
}
const result = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Page from './app/dashboard/lucrari/[id]/revizie/[equipmentId]/page'; createRoot(document.getElementById('root')).render(<Page/>);`, resolveDir: process.cwd(), loader:'tsx' },
  bundle:true, write:false, format:'iife', platform:'browser', jsx:'automatic',
  define:{'process.env.NODE_ENV':'"test"'},
  plugins:[{name:'isolated-services',setup(b){
    b.onResolve({filter:/.*/},args => mocks[args.path] ? {path:args.path,namespace:'mock'} : undefined)
    b.onLoad({filter:/.*/,namespace:'mock'},args => ({contents:mocks[args.path],loader:'js'}))
  }}],
})
const browser = await chromium.launch({headless:true,channel:'chrome'})
let checks = 0
async function fixture({role='admin', complete=true}={}) {
  const page = await browser.newPage({viewport:{width:390,height:844}})
  await page.route('https://revision.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
  await page.goto('https://revision.test/work')
  await page.evaluate(({role,complete})=>{
    window.role=role
    window.seed={qrVerified:true,sections:[{id:'s',title:'Control',items:[{id:'i',label:'Luft canat/toc',...(complete?{state:'functional'}:{})}]}],photos:[],finalObservations:''}
    window.calls={writes:[],commands:[],routes:[],uploads:[],toasts:[]}
    window.saveDelay=()=>new Promise(resolve=>setTimeout(resolve,100))
    window.persist=payload=>{window.seed={...window.seed,...payload}; window.snapshot()}
  },{role,complete})
  await page.addScriptTag({content:result.outputFiles[0].text})
  await expect(page.locator('#final-observations')).toBeVisible()
  return page
}
async function openPrompt(page,hardware=false) {
  if(hardware) await page.evaluate(()=>history.back())
  else await page.getByRole('button',{name:'Înapoi la lucrare'}).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
}
try {
  for(const role of ['admin','tehnician']) {
    const page=await fixture({role})
    await page.locator('#final-observations').fill('  Ușa este încuiată  ')
    await openPrompt(page,true)
    await page.getByRole('button',{name:'Salvează și ieși'}).click()
    await expect.poll(()=>page.evaluate(()=>window.calls.routes.length)).toBe(1)
    assert.deepEqual(await page.evaluate(()=>window.calls.routes),['/dashboard/lucrari/work'])
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    const saved=await page.evaluate(()=>window.role==='admin'?window.calls.writes[0]:window.calls.commands[0])
    assert.equal(saved.finalObservations,'Ușa este încuiată')
    checks++; await page.close()
  }
  const incomplete=await fixture({complete:false})
  await incomplete.locator('#final-observations').fill('Progres parțial')
  await openPrompt(incomplete)
  await incomplete.getByRole('button',{name:'Salvează și ieși'}).click()
  await expect.poll(()=>incomplete.evaluate(()=>window.calls.routes.length)).toBe(1)
  const partial=await incomplete.evaluate(()=>window.calls.writes[0])
  assert.equal('state' in partial.sections[0].items[0],false)
  checks++; await incomplete.close()

  const failure=await fixture()
  await failure.locator('#final-observations').fill('Păstrează textul')
  await failure.evaluate(()=>{window.fail=true;window.saveDelay=()=>new Promise(r=>setTimeout(r,500))})
  await openPrompt(failure)
  await failure.getByRole('button',{name:'Salvează și ieși'}).click()
  await expect(failure.getByRole('button',{name:'Se salvează…'})).toBeDisabled()
  await expect(failure.getByRole('button',{name:'Nu salva'})).toBeDisabled()
  await expect(failure.locator('#final-observations')).toBeDisabled()
  await expect(failure.getByRole('button',{name:'Salvează și ieși'})).toBeEnabled()
  await expect(failure.getByRole('alertdialog')).toBeVisible()
  assert.equal(await failure.evaluate(()=>window.calls.routes.length),0)
  assert.equal(await failure.evaluate(()=>window.calls.writes.length),1)
  await failure.getByRole('button',{name:'Rămâi aici'}).click()
  await expect(failure.locator('#final-observations')).toHaveValue('Păstrează textul')
  await failure.evaluate(()=>{window.fail=false})
  await openPrompt(failure)
  await failure.getByRole('button',{name:'Salvează și ieși'}).click()
  await expect.poll(()=>failure.evaluate(()=>window.calls.routes.length)).toBe(1)
  checks++; await failure.close()

  for(const role of ['admin','tehnician']) {
    const photo=await fixture({role})
    await photo.locator('input[type=file]').setInputFiles({name:'door.png',mimeType:'image/png',buffer:Buffer.from('photo')})
    await openPrompt(photo)
    await photo.getByRole('button',{name:'Salvează și ieși'}).click()
    await expect.poll(()=>photo.evaluate(()=>window.calls.routes.length)).toBe(1)
    assert.equal(await photo.evaluate(()=>window.seed.photos.length),1)
    assert.deepEqual(await photo.evaluate(()=>window.calls.uploads),['door.png'])
    checks++; await photo.close()
  }
  const full=await fixture()
  await full.locator('#final-observations').fill('  Revizie completă  ')
  await full.getByRole('button',{name:'Salvează',exact:true}).click()
  await expect.poll(()=>full.evaluate(()=>window.calls.routes.length)).toBe(1)
  await expect(full.getByRole('alertdialog')).toHaveCount(0)
  assert.equal(await full.evaluate(()=>window.seed.overallState),'functional')
  checks++; await full.close()
  const clean=await fixture()
  await clean.locator('#final-observations').fill('   ')
  await clean.getByRole('button',{name:'Înapoi la lucrare'}).click()
  await expect.poll(()=>clean.evaluate(()=>window.calls.routes.length)).toBe(1)
  await expect(clean.getByRole('alertdialog')).toHaveCount(0)
  checks++; await clean.close()

  const discard=await fixture()
  await discard.locator('#final-observations').fill('De abandonat')
  await openPrompt(discard,true)
  await discard.getByRole('button',{name:'Nu salva'}).click()
  await expect.poll(()=>discard.evaluate(()=>window.calls.routes.length)).toBe(1)
  assert.equal(await discard.evaluate(()=>window.calls.writes.length),0)
  checks++; await discard.close()

  const retryPhotos=await fixture()
  await retryPhotos.locator('input[type=file]').setInputFiles(['one.png','two.png'].map(name=>({name,mimeType:'image/png',buffer:Buffer.from('photo')})))
  await retryPhotos.evaluate(()=>{window.failPhoto='two.png'})
  await openPrompt(retryPhotos)
  await retryPhotos.getByRole('button',{name:'Salvează și ieși'}).click()
  await expect(retryPhotos.getByRole('button',{name:'Salvează și ieși'})).toBeEnabled()
  assert.equal(await retryPhotos.evaluate(()=>window.calls.routes.length),0)
  await retryPhotos.evaluate(()=>{window.failPhoto=null})
  await retryPhotos.getByRole('button',{name:'Salvează și ieși'}).click()
  await expect.poll(()=>retryPhotos.evaluate(()=>window.calls.routes.length)).toBe(1)
  assert.deepEqual(await retryPhotos.evaluate(()=>window.calls.uploads),['one.png','two.png','two.png'])
  assert.equal(await retryPhotos.evaluate(()=>window.seed.photos.length),2)
  checks++; await retryPhotos.close()
  console.log(`${checks} browser scenarios passed (real UI/persistence adapter, mocked services; no production writes).`)
} finally { await browser.close() }
