// Real management and invoice components; Firebase, file storage and editor
// dialogs are isolated. The service suite separately verifies real transactions.
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'

const mocks = {
  '@/contexts/AuthContext': `export const useAuth=()=>({userData:{uid:'dispatcher',role:window.role,displayName:'Dispecer test'}});`,
  '@/lib/firebase/firestore': `export const getLucrareById=async()=>structuredClone(window.work); export const updateLucrare=async(id,patch)=>{window.calls.writes.push(patch); await new Promise(r=>setTimeout(r,30)); if(window.failSave) throw new Error('Salvare indisponibilă'); window.work={...window.work,...patch,...(patch.preluatDispecer?{preluatDe:'Dispecer test'}:{})};};`,
  '@/lib/firebase/storage': `export const uploadFile=async(file,path)=>{window.calls.uploads.push({name:file.name,path}); return {url:'https://storage.test/invoice.pdf',fileName:file.name};}; export const deleteFile=async()=>{};`,
  '@/hooks/use-toast': `export const toast=value=>window.calls.toasts.push(value);`,
  '@/components/report-generator': `export const ReportGenerator=()=>{throw new Error('Installation must not generate an intervention report')};`,
  '@/lib/pdf/revision-operations': `export const generateRevisionOperationsPDF=async()=>new Blob();`,
  '@/app/dashboard/lucrari/[id]/offer-editor-dialog': `export const OfferEditorDialog=({open,onOpenChange})=>open?<div role="dialog" aria-label="Editor ofertă existent"><button onClick={()=>onOpenChange(false)}>Închide oferta</button></div>:null;`,
  '@/app/dashboard/lucrari/[id]/deviz-editor-dialog': `export const DevizEditorDialog=({open,onOpenChange})=>open?<div role="dialog" aria-label="Editor deviz existent"><button onClick={()=>onOpenChange(false)}>Închide devizul</button></div>:null;`,
}
const result = await build({
  stdin: { contents: `import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {InstallationManagement} from '@/components/installation/management'; function Fixture(){const [work,setWork]=useState(window.work); window.replaceWork=patch=>{window.work={...window.work,...patch};setWork(window.work)};return <InstallationManagement work={work} onUpdate={setWork}/>};createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir:process.cwd(), loader:'tsx' },
  bundle:true, write:false, platform:'browser', format:'iife', jsx:'automatic', define:{'process.env.NODE_ENV':'"test"'},
  plugins:[{name:'isolated-dependencies',setup(b){
    b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'mock'}:undefined)
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'jsx',resolveDir:process.cwd()}))
  }}],
})
const browser = await chromium.launch({headless:true,channel:'chrome'})
let checks=0
async function fixture(role='dispecer',completed=false,picked=false) {
  const page=await browser.newPage({viewport:{width:390,height:844}})
  await page.route('https://installation-management.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
  await page.goto('https://installation-management.test/work')
  await page.evaluate(({role,completed,picked})=>{
    window.role=role
    window.work={id:'installation',client:'Client',locatie:'Sediu',tipLucrare:'Instalare',statusLucrare:completed?'Finalizat':'În lucru',preluatDispecer:picked,statusFacturare:'Nefacturat',installation:{schemaVersion:1,rootWorkId:'installation',...(completed?{closedReason:'completed',completionDocumentId:'final'}:{})}}
    window.calls={writes:[],uploads:[],toasts:[]}
    window.failSave=false
  },{role,completed,picked})
  await page.addScriptTag({content:result.outputFiles[0].text})
  return page
}
try {
  for(const role of ['admin','dispecer']) {
    const page=await fixture(role)
    await expect(page.getByText('Preluare, ofertare și facturare',{exact:true})).toBeVisible()
    await expect(page.getByRole('button',{name:'Preia tichetul',exact:true})).toBeDisabled()
    await expect(page.getByRole('button',{name:'Încarcă factură',exact:true})).toBeDisabled()
    await expect(page.getByRole('button',{name:'Editor deviz',exact:true})).toBeDisabled()
    await page.getByRole('switch',{name:'Necesită ofertă'}).click()
    await expect(page.getByRole('button',{name:'Editor ofertă',exact:true})).toBeEnabled()
    await page.getByRole('button',{name:'Editor ofertă',exact:true}).click()
    await expect(page.getByRole('dialog',{name:'Editor ofertă existent'})).toBeVisible()
    await page.getByRole('button',{name:'Închide oferta'}).click()
    assert.equal(await page.getByRole('button',{name:/Generează.*raport|Descarcă raport/}).count(),0)
    checks++;await page.close()
  }
  for(const role of ['tehnician','client']) {
    const page=await fixture(role,true)
    await expect(page.locator('#root')).toBeEmpty()
    checks++;await page.close()
  }
  const pickup=await fixture('dispecer',true)
  await pickup.getByRole('button',{name:'Preia tichetul',exact:true}).click()
  await expect(pickup.getByText('Preluat de Dispecer test',{exact:true})).toBeVisible()
  await expect(pickup.getByRole('button',{name:'Încarcă factură',exact:true})).toBeEnabled()
  await pickup.getByRole('button',{name:'Editor deviz',exact:true}).click()
  await expect(pickup.getByRole('dialog',{name:'Editor deviz existent'})).toBeVisible()
  await pickup.getByRole('button',{name:'Închide devizul'}).click()
  await pickup.locator('input[type=file]').first().setInputFiles({name:'factura.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')})
  await expect(pickup.getByText('Facturat',{exact:true})).toBeVisible()
  const calls=await pickup.evaluate(()=>window.calls)
  assert.equal(calls.uploads.length,1)
  assert.equal(calls.writes[0].preluatDispecer,true)
  assert.equal(calls.writes.at(-1).statusFacturare,'Facturat')
  assert(!calls.writes.some(patch=>'installation' in patch || 'statusLucrare' in patch))
  checks++;await pickup.close()

  const retry=await fixture('admin',true)
  await retry.evaluate(()=>window.failSave=true)
  await retry.getByRole('button',{name:'Preia tichetul',exact:true}).click()
  await expect.poll(()=>retry.evaluate(()=>window.calls.toasts.at(-1)?.description)).toBe('Salvare indisponibilă')
  await expect(retry.getByRole('button',{name:'Preia tichetul',exact:true})).toBeEnabled()
  await expect(retry.getByRole('button',{name:'Încarcă factură',exact:true})).toBeDisabled()
  await retry.evaluate(()=>window.failSave=false)
  await retry.getByRole('button',{name:'Preia tichetul',exact:true}).click()
  await expect(retry.getByText('Preluat de Dispecer test',{exact:true})).toBeVisible()
  checks++;await retry.close()

  const sent=await fixture('admin',true,true)
  await sent.evaluate(()=>window.replaceWork({necesitaOferta:true,offerSendCount:1}))
  await expect(sent.getByRole('switch',{name:'Necesită ofertă'})).toBeDisabled()
  await sent.evaluate(()=>window.replaceWork({statusLucrare:'Arhivată'}))
  await expect(sent.getByRole('button',{name:'Editor ofertă',exact:true})).toHaveCount(0)
  await expect(sent.getByRole('button',{name:'Indisponibil pentru tichete arhivate',exact:true})).toBeDisabled()
  checks++;await sent.close()
  console.log(`PASS: ${checks} installation management browser scenarios, isolated Firebase/storage/editor dependencies.`)
} finally { await browser.close() }
