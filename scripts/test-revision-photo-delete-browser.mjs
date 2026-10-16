// Real revision editor and Firebase adapter, with isolated transport/persistence doubles.
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const mocks = {
  'next/navigation': `export const useRouter=()=>({replace(){}});`,
  '@/contexts/AuthContext': `export const useAuth=()=>({userData:{uid:'test',role:window.role,displayName:'Test'}});`,
  '@/components/qr-code-scanner': `export const QRCodeScanner=()=>null;`,
  '@/hooks/use-toast': `export const useToast=()=>({toast:value=>window.calls.toasts.push(value)});`,
  '@/lib/firebase/config': `export const db={}; export const storage={}; export const auth={currentUser:{getIdToken:async()=>'test-token'}};`,
  '@/lib/firebase/firestore': `export const getLucrareById=async()=>({tipLucrare:'Revizie',statusLucrare:window.status,raportDataLocked:true});export const getClienti=async()=>[];export const updateLucrare=async()=>{};`,
  '@/firebase-functions/src/client-ticket-sync': `export const isContactSyncEligible=()=>false;export const resolveTicketLocation=()=>null;`,
  '@/lib/client-work-links': `export const createClientIndex=()=>({resolve:()=>null});`,
  '@/lib/revisions/checklist': `export const subscribeRevisionChecklistFromRoot=(id,cb)=>{cb({sections:window.seed.sections});return()=>{};};`,
  '@/lib/technician/client': `export const technicianFile=async file=>({path:file.name,url:'data:image/png;base64,',fileName:file.name});export const technicianCommand=async(action,id,payload)=>{window.calls.saves.push(payload);await window.saveDelay();window.persist(payload);};`,
  'firebase/firestore': `export const doc=(...args)=>args.slice(1).join('/');export const collection=doc;export const serverTimestamp=()=> 'now';export const getDocs=async()=>({docs:[]});const snap=()=>({id:'eq',exists:()=>true,data:()=>window.seed});export const getDoc=async()=>snap();export const onSnapshot=(ref,cb)=>{window.snapshot=()=>cb(snap());window.snapshot();return()=>{};};export const setDoc=async(ref,payload)=>{window.calls.saves.push(payload);await window.saveDelay();window.persist(payload);};export const updateDoc=setDoc;export const runTransaction=async(db,fn)=>fn({get:async()=>snap(),set:(ref,payload)=>window.persist(payload)});`,
  'firebase/storage': `export const ref=(storage,path)=>path;export const uploadBytes=async()=>{};export const getDownloadURL=async()=> 'data:image/png;base64,';`,
}
const result = await build({
  stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{RevisionOperationsSheet}from'./components/revision-operations-sheet';createRoot(document.getElementById('root')).render(<RevisionOperationsSheet workId="work" equipmentId="eq" checklistRootId="root" onSaveDraftRef={fn=>window.saveDraft=fn} onSaved={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},
  plugins:[{name:'isolated-services',setup(b){
    b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'mock'}:undefined)
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}))
  }}],
})
const content = await Promise.all(['components/revision-operations-sheet.tsx','components/ui/alert-dialog.tsx','components/ui/button.tsx'].map(path=>readFile(path,'utf8')))
const css = (await postcss([tailwindcss({content:content.map(raw=>({raw,extension:'tsx'})),corePlugins:{preflight:false}})]).process('@tailwind utilities;',{from:undefined})).css
const browser=await chromium.launch({headless:true,channel:'chrome'})
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1UAAAAASUVORK5CYII='
const photo=index=>({path:`revisions/work/eq/${index}.png`,url:png,fileName:`photo-${index}.png`})
let checks=0
async function fixture({role='admin',verified=true,width=390,count=1,status='Finalizat'}={}) {
  const page=await browser.newPage({viewport:{width,height:900},...(width===390?{isMobile:true,hasTouch:true}:{})})
  let seed={qrVerified:verified,sections:[{id:'s',title:'Control',items:[{id:'i',label:'Verificare',state:'functional'}]}],photos:Array.from({length:count},(_,i)=>photo(i)),finalObservations:''}
  await page.route('https://revision.test/**',async route=>{
    if(route.request().method()==='DELETE') {
      assert.equal(route.request().headers().authorization,'Bearer test-token')
      assert.match(route.request().url(),/\/api\/lucrari\/work\/revisions\/eq\/photos$/)
      const {path}=route.request().postDataJSON()
      const failure=await page.evaluate(async path=>{
        window.calls.deletes.push(path)
        await new Promise(r=>setTimeout(r,window.deleteDelay||40))
        if(window.failDelete)return true
        window.persist({photos:window.seed.photos.filter(p=>p.path!==path)})
        return false
      },path)
      seed=await page.evaluate(()=>window.seed)
      const partial=await page.evaluate(()=>window.partialDeleteFailure)
      await route.fulfill({status:failure||partial?503:200,contentType:'application/json',body:JSON.stringify(failure||partial?{error:'Ștergere eșuată. Reîncearcă.'}:{deleted:true,path})})
    } else {
      await route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`})
    }
  })
  async function mount(){
    await page.evaluate(({seed,role,status})=>{
      window.seed=seed;window.role=role;window.status=status;window.calls={deletes:[],saves:[],toasts:[]}
      window.saveDelay=()=>new Promise(r=>setTimeout(r,100))
      window.persist=payload=>{window.seed={...window.seed,...payload};window.snapshot?.()}
    },{seed,role,status})
    await page.addScriptTag({content:result.outputFiles[0].text})
    await expect(page.locator('#final-observations')).toBeVisible()
  }
  await page.goto('https://revision.test/work');await mount()
  return {page,reload:async()=>{await page.reload();await mount()}}
}
const saved=page=>page.getByRole('button',{name:'Șterge fotografia salvată 1',exact:true})
async function confirm(page){await saved(page).click();await page.getByRole('button',{name:'Șterge fotografia',exact:true}).click()}
try {
  for(const role of ['admin','dispecer','tehnician'])for(const verified of [false,true])for(const width of [390,1280]){
    const {page}=await fixture({role,verified,width})
    await page.mouse.move(0,0)
    await expect(saved(page)).toBeVisible()
    const style=await saved(page).evaluate(el=>({opacity:getComputedStyle(el).opacity,background:getComputedStyle(el).backgroundColor,pointer:getComputedStyle(el.parentElement.parentElement.parentElement).pointerEvents}))
    assert.equal(style.opacity,'1');assert.equal(style.background,'rgb(220, 38, 38)');assert.notEqual(style.pointer,'none')
    await saved(page).click();await page.getByRole('button',{name:'Renunță'}).click()
    assert.equal(await page.evaluate(()=>window.calls.deletes.length),0)
    await confirm(page)
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    assert.equal(await page.evaluate(()=>window.seed.photos.length),0)
    assert.equal(await page.evaluate(()=>window.calls.saves.length),0)
    checks++;await page.close()
  }
  const persisted=await fixture()
  await confirm(persisted.page);await expect(persisted.page.getByRole('alertdialog')).toHaveCount(0);await expect(saved(persisted.page)).toHaveCount(0)
  await persisted.reload();await expect(saved(persisted.page)).toHaveCount(0)
  checks++;await persisted.page.close()

  for(const role of ['admin','tehnician']){
    const {page}=await fixture({role,count:4})
    await page.locator('#final-observations').fill('Observații nesalvate')
    await confirm(page);await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.locator('#final-observations')).toHaveValue('Observații nesalvate')
    await page.locator('input[type=file]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:Buffer.from('photo')})
    const removeNew=page.getByRole('button',{name:'Șterge fotografia 1',exact:true})
    await expect(removeNew).toBeVisible();assert.equal(await removeNew.evaluate(el=>getComputedStyle(el).opacity),'1')
    await removeNew.click();await expect(removeNew).toHaveCount(0)
    await page.evaluate(()=>window.saveDraft())
    assert.equal(await page.evaluate(()=>window.seed.photos.length),3)
    assert.equal(await page.evaluate(()=>window.seed.photos.some(p=>p.path.endsWith('/0.png'))),false)
    assert.equal(await page.evaluate(()=>window.seed.finalObservations),'Observații nesalvate')
    checks++;await page.close()
  }

  for(const partial of [false,true]){
    const {page}=await fixture()
    await page.locator('#final-observations').fill('Ciornă protejată')
    await page.evaluate(partial=>{window.failDelete=!partial;window.partialDeleteFailure=partial;window.deleteDelay=350},partial)
    await saved(page).click();await page.getByRole('button',{name:'Șterge fotografia',exact:true}).click()
    await expect(page.getByRole('button',{name:'Se șterge…'})).toBeDisabled()
    await expect(page.getByRole('button',{name:'Renunță'})).toBeDisabled()
    assert.equal(await page.evaluate(()=>window.saveDraft()),false)
    await expect(page.getByRole('button',{name:'Reîncearcă ștergerea'})).toBeEnabled()
    await expect(page.getByRole('alert')).toContainText('Reîncearcă')
    assert.equal(await page.evaluate(()=>window.calls.deletes.length),1)
    await page.evaluate(()=>{window.failDelete=false;window.partialDeleteFailure=false})
    await page.getByRole('button',{name:'Reîncearcă ștergerea'}).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.locator('#final-observations')).toHaveValue('Ciornă protejată')
    assert.equal(await page.evaluate(()=>window.seed.photos.length),0)
    checks++;await page.close()
  }
  const {page}=await fixture()
  await page.locator('#final-observations').fill('Ciornă cu actualizare externă')
  await page.evaluate(()=>window.persist({photos:[]}))
  await expect(saved(page)).toHaveCount(0)
  await expect(page.locator('#final-observations')).toHaveValue('Ciornă cu actualizare externă')
  checks++;await page.close()
  console.log(`${checks} browser scenarios passed (real UI, compiled CSS and Firebase adapter; mocked transport/Storage).`)
} finally {await browser.close()}
