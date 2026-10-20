// Real page props, form/UI/domain and command client; isolated HTTP/Firestore boundaries.
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'

const source = await readFile('app/dashboard/lucrari/[id]/page.tsx', 'utf8')
const ast = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const initializers = []
function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'TehnicianInterventionForm') {
    const prop = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === 'initialData')
    assert(prop?.initializer && ts.isJsxExpression(prop.initializer))
    initializers.push(prop.initializer.expression.getText(ast))
  }
  ts.forEachChild(node, visit)
}
visit(ast)
assert.equal(initializers.length, 1, 'Exercise the actual page-to-form initialData mapping')

const mocks = {
  'next/navigation': `export const useRouter = () => ({push:url=>window.calls.routes.push(url)});`,
  '@/contexts/AuthContext': `export const useAuth = () => ({userData:{uid:'tech',role:'tehnician'}});`,
  '@/hooks/use-toast': `export const toast = value => window.calls.toasts.push(value);`,
  '@/hooks/use-settings': `export const useTargetList = () => ({items:[{id:'cause',name:'Uzură'}]});`,
  '@/lib/utils/logging-service': `export const logInfo = () => {};`,
  '@/lib/firebase/firestore': `export const getLucrareById = async () => window.seed; export const updateLucrare = async () => {throw Error('Unexpected direct write');};`,
  '@/lib/firebase/storage': `export const uploadFile = async () => {throw Error('Unexpected upload');}; export const deleteFile = async () => {};`,
  '@/lib/firebase/config': `export const auth={app:{options:{projectId:'demo-warranty'}},currentUser:{uid:'tech',getIdToken:async()=>'isolated-token'}}; export const db={};`,
  'firebase/firestore': `export const doc=()=>{}; export const getDoc=async()=>{throw Error('Unexpected implicit version refresh');};`,
}
const bundle = await build({
  stdin:{contents:`import React from 'react'; import {createRoot} from 'react-dom/client';
    import {TehnicianInterventionForm} from './components/tehnician-intervention-form';
    import {technicianCommand} from './lib/technician/client';
    import {interventionPatch,versionOf,assertCommand} from './packages/fom-domain';
    const serverWork={...window.seed}; window.serverWork=serverWork;
    const receipts=new Map();
    window.fetch=async (url,init)=>{
      if(url!=='/api/technician/commands') throw Error('Unexpected network request: '+url);
      if(init.headers.get('Authorization')!=='Bearer isolated-token') throw Error('Missing authentication');
      const command=JSON.parse(init.body); assertCommand(command);
      window.calls.attempts++;
      if(window.failure==='unknown') throw null;
      const respond=(data,status=200)=>new Response(JSON.stringify(data),{status});
      if(window.failure==='server') return respond({error:'Conflict: tichetul a fost modificat. Reîncarcă datele.',kind:'conflict'},409);
      if(receipts.has(command.mutationId)) return respond(receipts.get(command.mutationId));
      if(command.baseVersion!==versionOf(serverWork)) {
        window.calls.conflicts++;
        return respond({error:'Tichetul a fost modificat. Ciorna este păstrată.',kind:'conflict'},409);
      }
      const patch=command.action==='verify'
        ? {equipmentVerified:true}
        : interventionPatch({...serverWork,...command.payload},serverWork);
      Object.assign(serverWork,patch,{updatedAt:{seconds:1792490000,nanoseconds:serverWork.updatedAt.nanoseconds+1000000}});
      const version=versionOf(serverWork);
      const result={id:serverWork.id,version,work:{...serverWork,
        updatedAt:new Date(serverWork.updatedAt.seconds*1000+Math.floor(serverWork.updatedAt.nanoseconds/1e6)).toISOString(),
        mobileVersion:version}};
      receipts.set(command.mutationId,result);
      if(command.action==='verify') window.calls.verifications++;
      else window.calls.commands.push(command);
      localStorage.setItem('work',JSON.stringify(serverWork));
      if(window.failure==='lost-response') {window.failure='';throw Error('Răspuns pierdut');}
      return respond(result);
    };
    function Fixture(){const [lucrare,setLucrare]=React.useState(window.seed); const clientData=null;
      window.refreshParent=()=>setLucrare({...serverWork});
      return <TehnicianInterventionForm key={lucrare.id} lucrareId={lucrare.id} initialData={${initializers[0]}} onUpdate={()=>{}}/>;}
    async function start(){
      if(!window.seed.equipmentVerified) {
        const result=await technicianCommand('verify',serverWork.id,{code:'QR-test'},{work:serverWork});
        window.seed=result.work;
      }
      window.calls.attempts=0;
      createRoot(document.getElementById('root')).render(<Fixture/>);
    }
    start().catch(error=>{window.bootError=String(error)});`, resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"test"'},
  plugins:[{name:'isolated-services',setup(b){
    b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'mock'}:undefined)
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js',resolveDir:process.cwd()}))
  }}],
})

const browser = await chromium.launch({headless:true,channel:'chrome'})
let checks=0
async function mount(page, seed) {
  await page.evaluate(seed=>{
    window.seed=seed || JSON.parse(localStorage.getItem('work'))
    window.calls={commands:[],routes:[],toasts:[],attempts:0,verifications:0,conflicts:0}
    window.failure=''
  },seed)
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  await expect(page.locator('#descriereInterventie')).toBeVisible()
}
async function fixture(extra={}) {
  const page=await browser.newPage({viewport:{width:390,height:844}})
  await page.route('https://warranty.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
  await page.goto('https://warranty.test/work')
  await mount(page,{id:'warranty-work',tipLucrare:'Intervenție în garanție',statusLucrare:'În lucru',
    updatedAt:{seconds:1792490000,nanoseconds:123456789},
    descriereInterventie:'Intervenție efectuată',cauzaPrincipalaDefectId:'cause',cauzaPrincipalaDefect:'Uzură',...extra})
  return page
}
async function choose(page,label) {
  await page.locator('#tehnician-garantie-decizie').click()
  await page.getByRole('option',{name:label,exact:true}).click()
}
async function report(page) {
  await page.getByRole('button',{name:'Generează raport',exact:true}).click()
}
try {
  for(const [decision,label] of [
    ['confirma','Confirm garanția'],
    ['nu_intra','Nu face obiectul garanției'],
    ['dupa_atelier','Se va stabili după constatarea în atelier'],
  ]) {
    const page=await fixture()
    await expect(page.locator('#tehnician-garantie-decizie')).toBeVisible()
    await choose(page,label)
    if(decision==='nu_intra') await page.locator('#tehnician-garantie-motiv').fill('  Uzură mecanică  ')
    await page.getByRole('button',{name:'Salvează',exact:true}).click()
    await expect.poll(()=>page.evaluate(()=>window.calls.commands.length)).toBe(1)
    const saved=await page.evaluate(()=>window.calls.commands[0])
    assert.equal(saved.action,'intervention.save')
    assert.equal(saved.baseVersion,'ts:1792490000:124456789','Use exact QR version, not the serialized ISO timestamp')
    assert.equal(saved.payload.tehnicianGarantieDecizie,decision)
    assert.equal(saved.payload.tehnicianConfirmaGarantie,decision==='confirma')
    assert.equal(saved.payload.tehnicianGarantieNuIntraMotiv,decision==='nu_intra'?'Uzură mecanică':'')
    await page.locator('#descriereInterventie').fill('Actualizare după prima salvare')
    await report(page)
    await expect.poll(()=>page.evaluate(()=>window.calls.commands.length)).toBe(2)
    assert.equal(await page.evaluate(()=>window.calls.commands[1].baseVersion),'ts:1792490000:125456789')
    await expect.poll(()=>page.evaluate(()=>window.calls.routes.length)).toBe(1)
    await page.reload()
    await mount(page)
    await expect(page.locator('#tehnician-garantie-decizie')).toContainText(label)
    if(decision==='nu_intra') await expect(page.locator('#tehnician-garantie-motiv')).toHaveValue('Uzură mecanică')
    await report(page)
    await expect.poll(()=>page.evaluate(()=>({routes:window.calls.routes,toasts:window.calls.toasts.filter(t=>t.variant==='destructive')}))).toEqual({routes:['/raport/warranty-work'],toasts:[]})
    checks++; await page.close()
  }

  const invalid=await fixture()
  for(const action of ['Salvează','Generează raport']) {
    await invalid.getByRole('button',{name:action,exact:true}).click()
    await expect.poll(()=>invalid.evaluate(()=>window.calls.toasts.at(-1)?.description)).toBe('Selectați confirmarea garanției la fața locului.')
    assert.equal(await invalid.evaluate(()=>window.calls.attempts),0)
  }
  await choose(invalid,'Nu face obiectul garanției')
  await invalid.locator('#tehnician-garantie-motiv').fill('   ')
  for(const action of ['Salvează','Generează raport']) {
    await invalid.getByRole('button',{name:action,exact:true}).click()
    await expect.poll(()=>invalid.evaluate(()=>window.calls.toasts.at(-1)?.description)).toContain('Introduceți motivul')
    assert.equal(await invalid.evaluate(()=>window.calls.attempts),0)
  }
  await invalid.locator('#tehnician-garantie-motiv').fill('Motiv vechi')
  await choose(invalid,'Confirm garanția')
  await report(invalid)
  await expect.poll(()=>invalid.evaluate(()=>window.calls.commands.length)).toBe(1)
  assert.equal(await invalid.evaluate(()=>window.calls.commands[0].payload.tehnicianGarantieNuIntraMotiv),'')
  checks++; await invalid.close()

  const legacy=await fixture({tehnicianConfirmaGarantie:true})
  await expect(legacy.locator('#tehnician-garantie-decizie')).toContainText('Confirm garanția')
  await report(legacy)
  await expect.poll(()=>legacy.evaluate(()=>window.calls.routes.length)).toBe(1)
  checks++; await legacy.close()

  const ordinary=await fixture({tipLucrare:'Intervenție'})
  await expect(ordinary.locator('#tehnician-garantie-decizie')).toHaveCount(0)
  await report(ordinary)
  await expect.poll(()=>ordinary.evaluate(()=>window.calls.routes.length)).toBe(1)
  assert.equal(await ordinary.evaluate(()=>window.calls.commands[0].payload.tehnicianGarantieDecizie),undefined)
  checks++; await ordinary.close()

  const conflict=await fixture({tehnicianGarantieDecizie:'confirma'})
  await conflict.locator('#descriereInterventie').fill('Ciornă locală păstrată')
  await conflict.evaluate(()=>{
    window.serverWork.updatedAt={seconds:1792490000,nanoseconds:900000000}
    window.serverWork.descriereInterventie='Modificare făcută de alt utilizator'
    window.refreshParent()
  })
  await report(conflict)
  await expect.poll(()=>conflict.evaluate(()=>window.calls.toasts.at(-1)?.description)).toBe('Tichetul a fost modificat. Ciorna este păstrată.')
  assert.equal(await conflict.evaluate(()=>window.calls.conflicts),1)
  assert.equal(await conflict.evaluate(()=>window.calls.commands.length),0)
  await expect(conflict.locator('#descriereInterventie')).toHaveValue('Ciornă locală păstrată')
  assert.equal(await conflict.evaluate(()=>window.serverWork.descriereInterventie),'Modificare făcută de alt utilizator')
  checks++; await conflict.close()

  const retry=await fixture({tehnicianGarantieDecizie:'confirma'})
  await retry.evaluate(()=>{window.failure='lost-response'})
  await report(retry)
  await expect.poll(()=>retry.evaluate(()=>window.calls.toasts.at(-1)?.description)).toBe('Răspuns pierdut')
  await report(retry)
  await expect.poll(()=>retry.evaluate(()=>window.calls.routes.length)).toBe(1)
  assert.equal(await retry.evaluate(()=>window.calls.commands.length),1,'Retry must reuse the original command receipt')
  assert.equal(await retry.evaluate(()=>window.calls.conflicts),0)
  checks++; await retry.close()

  const errors=await fixture({tehnicianGarantieDecizie:'confirma'})
  for(const [failure,message] of [
    ['server','Conflict: tichetul a fost modificat. Reîncarcă datele.'],
    ['unknown','A apărut o eroare la salvarea datelor. Vă rugăm să încercați din nou.'],
  ]) {
    await errors.evaluate(failure=>{window.failure=failure},failure)
    await report(errors)
    await expect.poll(()=>errors.evaluate(()=>window.calls.toasts.at(-1)?.description)).toBe(message)
    assert.equal(await errors.evaluate(()=>window.calls.routes.length),0)
    await expect(errors.locator('#descriereInterventie')).toHaveValue('Intervenție efectuată')
  }
  checks++; await errors.close()
  console.log(`PASS: ${checks} scenarios at 390×844; real page props, form, UI, domain and command client; isolated HTTP/Firestore.`)
} finally {
  await browser.close()
}
