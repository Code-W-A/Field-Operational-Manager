import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Render the real revision page and installation workspace. APIs and child forms
// are isolated, so this checks navigation without reading or changing live data.
const noopUI = `import React from 'react';
export const Box=({children})=><div>{children}</div>;
export const Button=({asChild,children,variant,size,...props})=>asChild?children:<button {...props}>{children}</button>;
export const Tabs=Box, TabsList=Box, TabsTrigger=({children})=><span>{children}</span>, TabsContent=Box;
export const AlertDialog=({open,children})=>open?<div role="dialog">{children}</div>:null;
export const AlertDialogCancel=Button;
export const Input=props=><input {...props}/>;export const Textarea=props=><textarea {...props}/>;export const Label=props=><label {...props}/>;
export const Card=Box,CardHeader=Box,CardContent=Box,CardTitle=Box,CardDescription=Box,CardFooter=Box;
export const AlertDialogContent=Box,AlertDialogHeader=Box,AlertDialogTitle=Box,AlertDialogDescription=Box,AlertDialogFooter=Box;
export const Skeleton=Box, Badge=Box, Progress=Box, Table=Box, TableBody=Box, TableCell=Box, TableHead=Box, TableHeader=Box, TableRow=Box, AlertDialogTrigger=Box, AlertDialogAction=Button;`
const mocks = {
 '@/components/equipment-qr-code': `export const EquipmentQRCode=()=>null;`,
 'next/navigation': `const router={push:href=>location.assign(href),replace:href=>location.replace(href),back:()=>history.back()};export const useRouter=()=>router;export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useParams=()=>({id:'w',equipmentId:'e'});`,
 'next/link': `import React from 'react';export default props=><a {...props}/>;`,
 '@/contexts/AuthContext': `export const useAuth=()=>({userData:{uid:'admin',role:'admin'}});`,
 '@/hooks/use-toast': `export const toast=()=>{};`,
 '@/components/dashboard-shell': `export const DashboardShell=({children})=>children;`,
 '@/components/dashboard-header': `import React from 'react';export const DashboardHeader=({heading,children})=><header><h1>{heading}</h1>{children}</header>;`,
 '@/components/qr-code-scanner': `export const QRCodeScanner=()=>null;`,
 './installation/header-action': `export const InstallationHeaderAction=({children})=>children;`,
 './installation/team': `export const InstallationTeam=()=>null;`,
 '@/lib/installations/client': `export const installationApi=id=>'/api/'+id;export async function installationRequest(url,body){if(body&&window.failWrite)throw Error('Operația a eșuat');return window.installation;}`,
 './installation/forms': `import React from 'react';export const InstallationSheetForm=()=>null;export const InstallationCompletionForm=({onComplete})=><button onClick={async()=>{if(!window.failWrite)await onComplete()}}>Confirmă finalizarea</button>;`,
 '@/lib/firebase/firestore': `export const getLucrareById=async()=>({id:'w'});export const getClientById=async()=>null;export const getClienti=async()=>[];`,
 '@/firebase-functions/src/client-ticket-sync': `export const resolveTicketLocation=()=>null;`,
 '@/components/revision-operations-sheet': `import React,{useEffect}from'react';export const RevisionOperationsSheet=({onSaved,onUnsavedChanges,onSaveDraftRef})=>{useEffect(()=>{onUnsavedChanges(true);onSaveDraftRef(async()=>!window.failWrite)},[]);return <button onClick={onSaved}>Finalizează fișa</button>};`,
}
// The ordinary-ticket fixture invokes the real delete handler rather than a copy.
const source = ts.createSourceFile('ticket.tsx',readFileSync('app/dashboard/lucrari/[id]/page.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX)
let deleteHandler
function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(source)==='handleDeleteLucrare')deleteHandler=n.initializer.arguments[0].getText(source);ts.forEachChild(n,visit)}visit(source)
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import{createRoot}from'react-dom/client';
import{InstallationWorkspace}from'./components/installation-workspace';
import Revision from './app/dashboard/lucrari/[id]/revizie/[equipmentId]/page';
import{ticketExitHref}from'./lib/navigation/ticket-origin';
function Ordinary(){const role='admin',lucrare={id:'w'},exitHref=ticketExitHref(new URLSearchParams(location.search).get('from')),toast=()=>{},router={push:href=>location.assign(href)},deleteLucrare=async()=>{if(window.failWrite)throw Error('write failed')};const run=${deleteHandler};return <button onClick={run}>Șterge tichetul</button>}
const installation=location.pathname.includes('instalare');
createRoot(document.getElementById('root')).render(installation?<InstallationWorkspace workId="w" compact={new URLSearchParams(location.search).get('compact')==='1'} complete={new URLSearchParams(location.search).get('complete')==='1'}/>:location.pathname.includes('revizie')?<Revision/>:<Ordinary/>);
`},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.startsWith('@/components/ui/')?{path:'ui',namespace:'mock'}:mocks[a.path]?{path:a.path,namespace:'mock'}:undefined)
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='ui'?noopUI:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))
}}]})
const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || "chrome"})
try {
 const page=await browser.newPage()
 page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000)
 page.on('pageerror',error=>console.error('Browser error:',error.message))
 await page.addInitScript(()=>{window.installation={work:{id:'w',client:'Client test',tehnicieni:[],locatie:'Locație',equipmentIds:['e'],installation:{schemaVersion:1,startedEquipmentIds:[],equipment:[{id:'e',name:'Echipament'}],equipmentStatus:{e:'done'},activeSheetByEquipment:{},awaitingSheetByEquipment:{},rootWorkId:'w'}},sheets:[],canStart:true,managementActions:{archiveReasons:[]}}})
 await page.route('http://ticket.test/**',route=>route.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'}))
 const open=async path=>{console.log('Checking',path);await page.goto('http://ticket.test'+path);await page.addScriptTag({content:bundle.outputFiles[0].text})}
 // Ordinary action: failure stays, successful retry returns to the right source.
 for(const from of ['', '?from=dashboard']){
  await open('/dashboard/lucrari/w'+from);await page.evaluate(()=>window.failWrite=true)
  await page.getByRole('button',{name:'Șterge tichetul'}).click();expect(new URL(page.url()).pathname).toBe('/dashboard/lucrari/w')
  await page.evaluate(()=>window.failWrite=false);await page.getByRole('button',{name:'Șterge tichetul'}).click();await page.waitForURL('**'+(from?'/dashboard':'/dashboard/lucrari'))
 }
 await open('/dashboard/lucrari/w/revizie/e?from=dashboard')
 await page.getByRole('button',{name:'Înapoi la tichet'}).click();await page.evaluate(()=>window.failWrite=true)
 await page.getByRole('button',{name:'Salvează și ieși'}).click();await expect(page.getByRole('dialog')).toBeVisible()
 await page.evaluate(()=>window.failWrite=false);await page.getByRole('button',{name:'Salvează și ieși'}).click();await page.waitForURL('**/dashboard/lucrari/w?from=dashboard')
 for(const from of ['dashboard','arhivate']){
  await open('/dashboard/lucrari/w/instalare?tab=sheets&from='+from)
  await expect(page.getByRole('link',{name:'Înapoi la tichet'})).toHaveAttribute('href','/dashboard/lucrari/w?from='+from)
  await page.reload();await page.addScriptTag({content:bundle.outputFiles[0].text})
  await expect(page.getByRole('link',{name:'Înapoi la tichet'})).toHaveAttribute('href','/dashboard/lucrari/w?from='+from)
  await page.getByRole('button',{name:'Șterge tichetul',exact:true}).click();await page.evaluate(()=>window.failWrite=true)
  await page.getByRole('dialog').getByRole('button',{name:'Șterge',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(()=>window.failWrite=false);await page.getByRole('dialog').getByRole('button',{name:'Șterge',exact:true}).click();await page.waitForURL('**'+(from==='dashboard'?'/dashboard':'/dashboard/lucrari'))
 }
 await open('/dashboard/lucrari/w/instalare?tab=documents&complete=1&from=dashboard')
 await page.getByRole('button',{name:'Confirmă finalizarea'}).click();await page.waitForURL('**/dashboard')
 console.log('Browser navigation passed: ordinary action failure/retry, revision save failure/retry, installation reload/origin/delete failure/retry/completion, default destinations.')
} finally {await browser.close()}
