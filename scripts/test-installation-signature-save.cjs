// Real form with isolated API and UI controls; no backend or production writes.
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
(async () => {
  const box = names => `import React from 'react';${names.map(n => `export const ${n}=({children,...props})=><div>{children}</div>;`).join('')}`;
  const mocks = {
    'lucide-react': 'export const Loader2=()=>null;',
    '@/components/ui/button': `import React from'react';export const Button=({children,...p})=><button {...p}>{children}</button>;`,
    '@/components/ui/card': box(['Card','CardContent','CardHeader','CardTitle']),
    '@/components/ui/input': `import React from'react';export const Input=p=><input {...p}/>;`,
    '@/components/ui/textarea': `import React from'react';export const Textarea=p=><textarea {...p}/>;`,
    '@/components/ui/label': `import React from'react';export const Label=p=><label {...p}/>;`,
    '@/components/ui/badge': box(['Badge']),
    '@/components/ui/alert-dialog': `import React,{createContext,useContext} from'react';const Close=createContext(()=>{});export const AlertDialog=({open,children,onOpenChange})=>open?<Close.Provider value={()=>onOpenChange(false)}><div role='dialog'>{children}</div></Close.Provider>:null;export const AlertDialogAction=({children,onClick})=><button onClick={onClick}>{children}</button>;export const AlertDialogCancel=({children})=>{const close=useContext(Close);return <button onClick={close}>{children}</button>};` + box(['AlertDialogContent','AlertDialogHeader','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter']),
    '@/components/signature-pad': `import React from'react';export const SignaturePad=({title,onSave,existingSignature})=><button onClick={()=>onSave('data:image/png;base64,test')}>{title}{existingSignature?' confirmată local':''}</button>;`,
    '@/contexts/AuthContext': `export const useAuth=()=>({userData:{uid:'tech',role:'tehnician'}});`,
    '@/lib/installations/client': `export const installationApi=()=>'/fake';export const installationRequest=(...args)=>window.request(...args);`,
    'next/navigation': `export const useRouter=()=>({push:href=>window.navigated.push(href)});`,
    [root+'/components/installation/team']: `export const sheetStateLabel=s=>s.state;`,
    [root+'/components/installation/signing-notice']: `export const InstallationSigningNotice=()=>null;`,
    [root+'/components/installation/shared']: `export const pdf=()=>{};export const statuses={in_progress:'În lucru'};export const dateLabel=d=>d;`,
  };
  const bundle = await build({
    stdin: {resolveDir:root,loader:'tsx',contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{InstallationSheetForm}from'./components/installation/forms';function App(){const[s,setSheet]=useState(window.sheet);return <><a href='/other'>Altă pagină</a><InstallationSheetForm workId='work' sheet={s} onSheet={setSheet} onRefresh={async()=>{}} onStopped={()=>window.stopped++}/></>};createRoot(document.getElementById('root')).render(<App/>);`},
    bundle:true,write:false,format:'iife',jsx:'automatic',
    plugins:[{name:'boundaries',setup(b){
      b.onResolve({filter:/.*/},a=>{const key=a.path.startsWith('.')?path.resolve(a.resolveDir,a.path):a.path;if(mocks[key])return{path:key,namespace:'mock'};});
      b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:root}));
    }}],
  });
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const initialState of ['draft','awaiting_signature']) {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.setContent('<div id="root"></div>');
      await page.evaluate(state=>{
        window.sheet={id:'sheet',state,revision:1,principalUid:'tech',principalName:'Tehnician',workDate:'2026-11-11',finding:'Constatare',operations:'Montaj',installationStatus:'in_progress',photos:[]};
        window.commands=[];window.navigated=[];window.stopped=0;
        window.request=async(_url,payload)=>{
          window.commands.push(payload);
          if(window.fail)throw Error('Eroare test la salvare');
          window.sheet={...window.sheet,...payload.fields,revision:window.sheet.revision+1,...(['close','sign'].includes(payload.action)?{state:'closed',documentSnapshot:payload.signatures}:{})};
          return {sheet:window.sheet};
        };
      },initialState);
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      await page.getByLabel('Numele beneficiarului *').fill('Beneficiar');
      await page.getByRole('button',{name:'Semnătura beneficiarului',exact:true}).click();
      await page.getByRole('button',{name:/Semnătura tehnicianului/}).click();
      const save=page.getByRole('button',{name:'Salvează ciorna',exact:true});
      await save.click();
      await expect(page.getByRole('status')).toContainText('Semnăturile nu sunt încă salvate pe server');
      await expect(page.getByRole('button',{name:/Semnătura beneficiarului confirmată local/})).toBeVisible();
      await page.getByText('Altă pagină',{exact:true}).click();
      await expect(page.getByRole('dialog')).toContainText('Semnăturile nu sunt salvate');
      expect(await page.evaluate(()=>window.navigated)).toEqual([]);
      await page.getByRole('button',{name:'Rămân pe fișă'}).click();
      if(initialState==='draft') {
        await page.getByRole('button',{name:/^(Oprește lucrul și semnează ulterior|Semnează ulterior)$/}).click();
        await expect(page.getByRole('alert')).toContainText('Închide și semnează fișa');
        expect(await page.evaluate(()=>window.commands.length)).toBe(1);
        expect(await page.evaluate(()=>window.stopped)).toBe(0);
      }
      const sign=page.getByRole('button',{name:initialState==='draft'?'Închide fișa zilei':'Semnează fișa',exact:true});
      await page.evaluate(()=>window.fail=true);
      await sign.click();
      await expect(page.getByRole('alert')).toContainText('Eroare test');
      await expect(page.getByRole('button',{name:/Semnătura beneficiarului confirmată local/})).toBeVisible();
      await page.evaluate(()=>window.fail=false);
      await sign.click();
      await expect(page.getByRole('status')).toContainText('închisă și semnată');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const payload=await page.evaluate(()=>window.commands.at(-1));
      expect(payload.action).toBe(initialState==='draft'?'close':'sign');
      expect(payload.signatures.technicianSignature).toBeTruthy();
      expect(payload.signatures.beneficiarySignature).toBeTruthy();
      expect(payload.revision).toBe(2);
      expect(errors).toEqual([]);
      console.log(`PASS ${initialState}: draft save retains signatures and exit guard; deferred stop protected; failed sign retains signatures; retry confirms both`);
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
