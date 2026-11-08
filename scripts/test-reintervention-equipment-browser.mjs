/** Real form and selector with isolated in-memory reads. No Firebase writes or network. */
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'node:http'
const client = { id: 'c', nume: 'Client izolat', locatii: [{ id: 'l', nume: 'Loc', persoaneContact: [{id:'p',nume:'Contact',telefon:'100'}], echipamente: [
  { id: 'e1', nume: 'Echipament unu', cod: 'P1' }, { id: 'e2', nume: 'Echipament doi', cod: 'P2' }, { id: 'other', nume: 'Nepermis', cod: 'X' }
] }] }
const mocks = {
  '@/contexts/AuthContext': `export const useAuth = () => ({userData:{uid:'test',role:'admin'}});`,
  '@/hooks/use-settings': `const items=[];export const useTargetList=()=>({items});export const useTargetValue=()=>({value:null});`,
  '@/hooks/use-firebase-collection': `const data=[${JSON.stringify(client)}];export const useFirebaseCollection=()=>({data,loading:false,error:null});`,
  '@/hooks/use-toast': `export const toast=()=>{};`,
  'next/navigation': `const router={push(){},replace(){},refresh(){}};export const useRouter=()=>router;export const usePathname=()=>'/test';export const useSearchParams=()=>new URLSearchParams();`,
  './client-form': `export const ClientForm=()=>null;`,
  './contract-select': `export const ContractSelect=()=>null;`,
  '@/components/DynamicDialogFields': `export const DynamicDialogFields=()=>null;`,
  '@/lib/firebase/firestore': `export const getClienti=async()=>[${JSON.stringify(client)}];export const getClientById=async()=>(${JSON.stringify(client)});`,
}
const result = await build({stdin:{contents:`
import React,{useState,useCallback} from 'react';import{createRoot}from'react-dom/client';
import{LucrareForm}from'./components/lucrare-form';
import{prepareReinterventionContact,refreshReinterventionContact}from'./lib/work-documents/live-ticket-contact';
import{prepareRevisionReinterventionEquipment,validateRevisionReinterventionEquipment}from'./lib/work-documents/reintervention-equipment';
const client=${JSON.stringify(client)};
function App(){const [form,setForm]=useState(null);const [saved,setSaved]=useState('');const [active,setActive]=useState(0);const activeChange=useCallback(n=>{setActive(n);window.active=n},[]);const change=useCallback((k,v)=>setForm(p=>({...p,[k]:v})),[]);
window.start=async(ids,normal=false)=>{setSaved('');const prepared=normal?{}:await prepareReinterventionContact({tipLucrare:'Revizie',clientId:'c',locationId:'l',contactId:'p',equipmentIds:ids});setForm({tipLucrare:'Re-Intervenție',clientId:'c',client:'Client izolat',locationId:'l',locatie:'Loc',contactId:'p',persoanaContact:'Contact',telefon:'100',tehnicieni:[],descriere:'Test',statusLucrare:'Listată',statusFacturare:'Nefacturat',...(normal?{echipamentId:'e1',echipament:'Echipament unu',echipamentCod:'P1'}:prepared)});};window.form=form;
return <><button disabled={active>0} onClick={async()=>{try{const fields=await refreshReinterventionContact(form);setSaved(JSON.stringify({...form,...fields,lucrareOriginala:'original'}))}catch(e){setSaved(e.message)}}}>Verifică payload</button><output>{saved}</output>{form&&<LucrareForm key={JSON.stringify(form.reinterventionEquipmentIds)} dataEmiterii={new Date()} dataInterventie={new Date()} setDataEmiterii={()=>{}} setDataInterventie={()=>{}} formData={form} handleInputChange={e=>change(e.target.id,e.target.value)} handleSelectChange={change} handleCustomChange={change} handleTehnicieniChange={()=>{}} isReintervention onActiveWorkChange={activeChange} currentWorkOrderId="original"/>}</>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}'},plugins:[{name:'isolated',setup(b){
 b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js',resolveDir:process.cwd()}));
 b.onLoad({filter:/lib\/firebase\/(config|firebase)\.ts$/},()=>({contents:`import{initializeApp}from'firebase/app';import{getFirestore}from'firebase/firestore';import{getAuth}from'firebase/auth';const app=initializeApp({projectId:'demo-reintervention',apiKey:'demo'});export const db=getFirestore(app),auth=getAuth(app),storage=null,functions=null;export{app};export default app;`,loader:'js'}));
 b.onResolve({filter:/^firebase\/firestore$/},a=>a.namespace==='mock-fs'?undefined:{path:a.path,namespace:'mock-fs'});
 b.onLoad({filter:/.*/,namespace:'mock-fs'},()=>({contents:`export * from 'firebase/firestore';export const getDocs=async()=>({docs:window.mockConflict?[{id:'active',data:()=>({statusLucrare:'În lucru',nrLucrare:'#ACTIVE'})}]:[],empty:!window.mockConflict,size:window.mockConflict?1:0,forEach(){}});export const getDoc=async()=>({exists:()=>false});export const onSnapshot=(q,cb)=>{cb({docs:[],empty:true,forEach(){}});return()=>{}};`,loader:'js',resolveDir:process.cwd()}));
}}]});
const server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(result.outputFiles[0].text)}else res.end('<html><div id="root"></div><script src="/bundle.js"></script></html>')});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,channel:"chrome"});try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.request().url().startsWith(`http://127.0.0.1:${server.address().port}`)?route.continue():route.abort());await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.start);
await page.evaluate(()=>window.start(['e1']));let selector=page.locator('label[for="echipament"]').locator('..').getByRole('combobox');await expect(selector).toContainText('Echipament unu');await expect(selector).toBeDisabled();await page.getByText('Verifică payload',{exact:true}).click();await expect(page.locator('output')).toContainText('"echipamentCod":"P1"');
await page.evaluate(()=>window.start(['e1','e2']));selector=page.locator('label[for="echipament"]').locator('..').getByRole('combobox');await expect(selector).toBeEnabled();await selector.click();await expect(page.getByText('Nepermis',{exact:true})).toHaveCount(0);await page.getByText('Echipament doi',{exact:true}).click();await expect(selector).toContainText('Echipament doi');await page.getByText('Verifică payload',{exact:true}).click();await expect(page.locator('output')).toContainText('"echipamentId":"e2"');await expect(page.locator('output')).toContainText('"lucrareOriginala":"original"');
for(const ids of [[],['deleted']]){await page.evaluate(ids=>window.start(ids),ids);await expect(page.getByRole('alert').filter({hasText:ids.length?'nu mai există':'nu are ID-uri'})).toBeVisible();await page.getByText('Verifică payload',{exact:true}).click();await expect(page.locator('output')).not.toContainText('lucrareOriginala');}
await page.evaluate(()=>{window.mockConflict=true;return window.start(['e1','e2'])});selector=page.locator('label[for="echipament"]').locator('..').getByRole('combobox');await selector.click();await page.getByText('Echipament doi',{exact:true}).click();await page.waitForFunction(()=>window.active===1);await expect(page.getByText('Verifică payload',{exact:true})).toBeDisabled();await page.evaluate(()=>window.mockConflict=false);
await page.evaluate(()=>window.start([],true));await expect(page.locator('label[for="echipament"]').locator('..').getByRole('combobox')).toContainText('Echipament unu');await expect(page.locator('label[for="echipament"]').locator('..').getByRole('combobox')).toBeDisabled();if(errors.length)throw Error(errors.join('\n'));console.log('PASS: real form single/multi selection, restricted options, missing/deleted errors, payload, live-read preparation/refresh, active conflict and normal intervention regression');
}finally{await browser.close();await new Promise(r=>server.close(r));}
