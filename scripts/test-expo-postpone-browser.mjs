import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const er=createRequire(`${process.cwd()}/../expo-mobile-app/package.json`);
const auth=`export const useAuth=()=>({status:'authenticated',user:{uid:window.uid||'tech'},profile:{displayName:'Tehnician',role:window.role||'tehnician'},backendReady:true});`;
const provider=`export const useConnected=()=>window.c;`;
const mocks={
'../offline-tickets/work-status':`export const WorkStatus=()=>null;`,
'../offline-tickets/status':`export const DraftStatus=()=>null;`,
'expo-router':`export const router={push:v=>{window.routes.push(v);if(window.navigate&&typeof v==='string'&&v.includes('/sheet/')){window.params={id:'work',sheetId:'s'};window.renderAgain();}},dismissTo:v=>{window.routes.push(v);if(window.navigate){window.params={id:'work'};window.renderAgain();}},replace:v=>window.routes.push(v),setParams:v=>window.routes.push(v),canGoBack:()=>true,back:()=>window.routes.push('back')};export const useNavigation=()=>({dispatch:v=>window.routes.push(v)});export const useLocalSearchParams=()=>window.params;`,
'expo-router/build/react-navigation/core':`export const usePreventRemove=(enabled,callback)=>{window.guard={enabled,callback};};`,
'expo-crypto':`export const randomUUID=()=> 'fixture-'+(++window.ids);`,
'react-native-safe-area-context':`export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
'@expo/vector-icons':`import React from'react';export const Feather=()=> <span aria-hidden>◇</span>;`,
'./auth/provider':auth,'../auth/provider':auth,'./auth/settings':`export const authSettings=()=>({mode:'emulator'});`,
'./app-header':`import React from'react';export const AppHeader=()=> <header style={{padding:16,background:'#14202C',color:'white'}}>FOM · Tehnician</header>;`,
'./store':`export const useDemo=()=>({state:{online:true},storageError:''});`,
'./connected/provider':provider,'./provider':provider,
'../navigation/provider':`import{useState}from'react';export const useScreenState=(key,initial,choices)=>{const[value,set]=useState(()=>window.section||initial());return [choices&&!choices.includes(value)?initial():value,set];};`,
'../crm/ui':`import React from'react';export const Dialog=({title,children,onClose})=><div role='dialog' style={{position:'fixed',inset:0,background:'#0008',display:'flex',alignItems:'end',zIndex:10}}><div style={{background:'#F5F7F9',borderRadius:24,padding:20,width:'100%',maxHeight:'90vh',overflow:'auto'}}><h2>{title}</h2>{children}<button onClick={onClose}>Închide dialogul</button></div></div>;`,
'./ui':`import React,{useState}from'react';import{Button,Txt}from'../ui';export const useDraft=(key,initial)=>{const[data,setData]=useState(()=>window.drafts[key]||initial);return{data,error:'',reset:next=>{window.drafts[key]=next;setData(next);},patch:p=>setData(old=>{const next={...old,...p};window.drafts[key]=next;return next;})};};export const Action=({title,run,disabled,secondary})=>{const[busy,setBusy]=useState(false),[message,setMessage]=useState('');return <div><Button secondary={secondary} loading={busy} title={busy?'Se procesează…':title} disabled={disabled||busy||!window.c.online} onPress={async()=>{setBusy(true);try{setMessage((await run())||'Confirmat de server');}catch(e){setMessage(e.message);}finally{setBusy(false);}}}/>{message&&<Txt accessibilityRole='alert'>{message}</Txt>}</div>};export const downloadDocument=async()=>{};export const Photos=({files,existing=[],limit=4,disabled,onChange,title})=><div><h3>{title||'Fotografii'}</h3><p>{files.length+existing.length} / {limit}</p><Button title='Alege fotografie' disabled={disabled||files.length+existing.length>=limit} onPress={()=>onChange([...files,{id:'photo-'+(++window.ids),uri:'test',name:'photo',contentType:'image/jpeg'}],existing)}/></div>;export const Choice=({label,value,options,onChange,disabled})=><label style={{display:'grid',gap:8}}>{label}<select aria-label={label} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}><option value=''>Selectează…</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;export const Sign=({label,paths=[],onChange,onExporter,disabled})=>{onExporter(async()=>paths.length?'data:image/png;base64,fixture':'');return <Button title={label} disabled={disabled} onPress={()=>onChange(['path'])}/>};`,
};
mocks['expo-router'] += `import {useEffect}from'react';export const useFocusEffect=callback=>useEffect(callback,[]);`;
mocks['expo-clipboard']=`export const setStringAsync=async()=>{};`;
mocks['expo-camera']=`import React,{useEffect}from'react';const result={granted:true,canAskAgain:true}, permission=async()=>result;export const useCameraPermissions=()=>[result,permission,permission];export const CameraView=({onCameraReady,onBarcodeScanned})=>{useEffect(()=>onCameraReady(),[]);return <button onClick={()=>onBarcodeScanned({data:window.scanRaw||'EQ1'})}>Simulează citirea QR</button>};`;
mocks['../history']=`import React from'react';export const HistoryLookup=()=>null;`;
mocks['../use-scan-wait']=`export const useScanWait=()=>false;`;
mocks['./attendance-special-day']=`export const useSpecialDayConfirmation=()=>({confirm:async()=>true,dialog:null});`;
const out=await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{TicketBody}from'../expo-mobile-app/src/connected/ticket';import{Installation}from'../expo-mobile-app/src/connected/installation';import{Scan}from'../expo-mobile-app/src/connected/scan';function Fixture(){const[v,setV]=useState(0);window.renderAgain=()=>setV(x=>x+1);return window.scan?<Scan/>:window.installation?<Installation/>:<TicketBody work={window.work} reportScreen={window.report}/>;}createRoot(document.getElementById('root')).render(<Fixture/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env':'{}','process.env.NODE_ENV':'"test"','__DEV__':'false'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>/^(react|react-dom)(\/|$)/.test(a.path)?{path:er.resolve(a.path)}:a.path==='react-native'?{path:er.resolve('react-native-web')}:mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:`${process.cwd()}/../expo-mobile-app/src/connected`}));}}]});
const fonts = (await Promise.all([['Roboto','Roboto_400Regular.ttf'],['Space','SpaceGrotesk_700Bold.ttf'],['Mono','IBMPlexMono_500Medium.ttf']].map(async ([name,file]) => `@font-face{font-family:${name};src:url(data:font/ttf;base64,${(await readFile(`${process.cwd()}/../expo-mobile-app/assets/fonts/${file}`)).toString('base64')})}`))).join('');
const browser=await chromium.launch({headless:true,channel:'chrome'});
async function fixture(opts={}){
 const p=await browser.newPage({viewport:{width:opts.width||360,height:800}});p.on('pageerror',e=>console.error('Fixture runtime:',e.message));await p.setContent('<style>'+fonts+'body{margin:0}select{min-height:48px;max-width:100%;font-size:16px}button{min-height:44px}label{font-family:Arial}header{font-family:Arial}</style><div id="root"></div>');
 await p.evaluate(opts=>{
  window.ids=0;window.routes=[];window.commands=[];window.fail=false;window.drafts={};window.uid=opts.uid||(opts.secondary?'secondary':'tech');window.role=opts.role||'tehnician';window.navigate=!!opts.navigate;window.scan=!!opts.scan;window.report=!!opts.report;window.installation=!!opts.installation;window.params={id:'work',...(opts.sheet?{sheetId:'s'}:{}),...(opts.scan?{ticket:'work',equipment:'eq',code:'EQ1',...(opts.installation?{installation:'1'}:{})}: {})};window.section=opts.section;
  window.work={id:'work',client:'Client local de test',locatie:'Locație de test',nrLucrare:'002107',tipLucrare:opts.type||'Intervenție contra cost',statusLucrare:'În lucru',tehnicieni:['Tehnician'],mobileVersion:'v1',equipmentVerified:opts.verified!==false,dataEmiterii:'2026-10-14',dataInterventie:'2026-10-15',timpSosire:'2026-10-14T11:46:00Z',equipmentIds:['eq'],descriereInterventie:'Reparat',constatareLaLocatie:'Defect constatat',cauzaPrincipalaDefectId:'cause',cauzaPrincipalaDefect:'Uzură',mobileEquipment:[{id:'eq',name:'Ușă cu denumire lungă pentru ecran îngust',code:'EQ1',model:'Model 1',warranty:{statusText:'În garanție',installationDate:'14.10.2025',warrantyExpires:'14.10.2027',warrantyMessage:'Garanție validă'}}],revision:{equipmentStatus:{eq:opts.done?'done':'in_progress'}},revisionEquipmentTimes:{eq:{verifiedAt:'2026-10-14T10:00:00Z'}}};
  const meta={schemaVersion:1,equipment:window.work.mobileEquipment,equipmentStatus:{eq:opts.done?'done':'in_progress'},activeSheetByEquipment:opts.done?{}:{eq:'s'},awaitingSheetByEquipment:{},...opts.meta};
  const sheet={id:'s',equipmentId:'eq',principalUid:'tech',principalName:'Tehnician',workDate:'2026-10-14',state:opts.state||'draft',revision:1,finding:'Constatare',operations:'Operațiuni',installationStatus:'in_progress',internalNote:'Privat principal',photos:[],participants:[{uid:'tech',name:'Tehnician',role:'principal',active:true},{uid:'secondary',name:'Secundar',role:'secondary',active:true}],canSign:opts.canSign,...opts.sheetData};if(opts.legacy)delete sheet.participants;
  const list={work:{...window.work,tipLucrare:'Instalare',installation:meta,...opts.workData},canStart:opts.canStart!==false,currentSession:opts.currentSession||null,sheets:[sheet],nextCursor:null,completion:null};
  window.c={canStopForSigning:()=>false,accessGranted:opts.accessGranted!==false,navigationGranted:true,ready:true,activeSession:opts.attendance===false?undefined:{id:'att'},online:opts.online!==false,state:{drafts:{},operations:[],bundle:{works:[window.work],settings:[],installations:{work:list},revisions:{work:[]}}},flushDrafts:async()=>{},persistDraft:async(key,value)=>{window.drafts[key]=value;},ensureQrAttendance:async()=>{},refresh:async()=>{},loadInstallation:async()=>{},enqueue:async()=>{throw Error('Nu trebuie salvat fără confirmare');},enqueueAndConfirm:async(action,id,payload,files)=>{window.commands.push({action,payload,files});if(window.delay)await new Promise(resolve=>window.finishSave=resolve);if(window.fail){const e=Error(typeof window.fail==='string'?window.fail:'Eroare de rețea');if(typeof window.fail==='string')e.code='DATA_CHANGED';throw e;}if(action==='installation'){const current=window.lastSheet||sheet;const updated={...current,...payload.fields,state:payload.action==='stop'?'awaiting_signature':['close','sign'].includes(payload.action)?'closed':current.state,revision:current.revision+1};window.lastSheet=updated;if(!opts.staleAfterSave||payload.action!=='save')window.c.state.bundle.installations.work.sheets=[updated];window.renderAgain();return {sheet:updated};}if(action==='report.finalize'){window.work={...window.work,raportGenerat:true,raportDataLocked:true};window.renderAgain();}return {draft:{...window.drafts.work,files:[]}};}};
 },opts);await p.addScriptTag({content:out.outputFiles[0].text});return p;
}

await mkdir('/private/tmp/fom-postpone',{recursive:true});
let passed=0;
try {
 for(const width of [320,390]){
 const p=await fixture({section:'Verificare',verified:false,width});
 const open=()=>p.getByRole('button',{name:'Amână intervenția',exact:true}).click();
 await open();const dialog=p.getByRole('dialog');await expect(dialog).toBeVisible();
 const field=dialog.getByLabel('Motivul amânării (minimum 10 caractere)');const confirm=()=>dialog.getByRole('button',{name:'Confirmă amânarea',exact:true});
 await expect(confirm()).toBeDisabled();await field.fill('    scurt   ');await expect(confirm()).toBeDisabled();
 await field.fill('  Piesa necesara nu este disponibila  ');await expect(confirm()).toBeEnabled();
 await expect(field).toHaveAttribute('maxlength','500');
 await dialog.getByRole('button',{name:'Anulează',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(p.getByRole('tab',{name:'Verificare echipament',exact:true})).toHaveAttribute('aria-selected','true');
 assert.equal(await p.evaluate(()=>window.commands.length),0);await open();await expect(field).toHaveValue('  Piesa necesara nu este disponibila  ');
 await dialog.getByRole('button',{name:'Închide dialogul',exact:true}).click();await open();await expect(field).toHaveValue('  Piesa necesara nu este disponibila  ');
 await p.evaluate(()=>{window.c.online=false;});await field.fill('   Piesa necesara nu este disponibila  ');await confirm().click();await expect(dialog).toBeVisible();assert.equal(await p.evaluate(()=>window.commands.length),0);
 await p.evaluate(()=>{window.c.online=true;window.fail='Tichetul a fost modificat. Ciorna este pastrata.';});await field.fill('  Piesa necesara nu este disponibila  ');
 await confirm().click();await expect(dialog.getByRole('alert')).toContainText('Datele au fost actualizate');await expect(field).toHaveValue('  Piesa necesara nu este disponibila  ');assert.equal(await p.evaluate(()=>window.routes.length),0);
 await p.evaluate(()=>{window.fail=true;});await confirm().click();await expect(dialog.getByRole('alert')).toContainText('Nu am putut confirma salvarea');assert.equal(await p.evaluate(()=>window.routes.length),0);
 await p.screenshot({path:`/private/tmp/fom-postpone/error-${width}.png`,fullPage:true});
 const before=await p.evaluate(()=>window.commands.length);await p.evaluate(()=>{window.fail=false;window.delay=true;});await confirm().evaluate(el=>{el.click();el.click();});
 await expect(dialog.getByRole('button',{name:'Anulează',exact:true})).toBeDisabled();await expect(field).not.toBeEditable();
 const count=await p.evaluate(()=>window.commands.length);assert.equal(count,before+1);await dialog.getByRole('button',{name:'Închide dialogul',exact:true}).click();await expect(dialog).toBeVisible();
 assert.equal(await p.evaluate(()=>window.commands.length),count);
 await p.evaluate(()=>window.finishSave());await expect.poll(()=>p.evaluate(()=>window.routes.at(-1))).toBe('/');
 assert.equal(await p.evaluate(()=>window.commands.at(-1).payload.motivAmanare),'Piesa necesara nu este disponibila');
 assert.equal(await p.evaluate(()=>window.commands.at(-1).action),'postpone');
 await p.close();passed++;
 }
 console.log(`PASS: postponement UI at ${passed} widths; cancel/reopen, validation, offline, errors, in-flight close lock and confirmed exit`);
}finally{await browser.close();}
