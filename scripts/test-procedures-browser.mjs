/** Real procedure page/editor and UI; isolated in-memory Firestore, no live data. */
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
const mocks = {
  '@/contexts/AuthContext': `export const useAuth=()=>({userData:window.role ? {uid:'test',role:window.role,displayName:'Admin'} : null});`,
  '@/components/dashboard-shell': `import React from 'react';export const DashboardShell=({children})=><main>{children}</main>;`,
  '@/lib/firebase/config': `export const db={};`,
  '@/lib/firebase/firestore': `export const addUserLogEntry=async()=>{};`,
  '@/hooks/use-toast': `export const toast=(value)=>window.toasts.push(value);`,
  'next/dynamic': `import React from 'react';export default function dynamic(loader){const Component=React.lazy(loader);return props=><React.Suspense fallback={<p>Loading editor</p>}><Component {...props}/></React.Suspense>;}`,
  'firebase/firestore': `
    export const collection=(db,path)=>path;export const doc=(db,path,id)=>id;
    export const serverTimestamp=()=>window.stamp;export const deleteField=()=>undefined;
    const emit=()=>window.snapshot?.({docs:window.notes.map(n=>({id:n.id,data:()=>n}))});
    export const onSnapshot=(ref,cb)=>{window.reads++;window.snapshot=cb;emit();return()=>{window.snapshot=null}};
    export const addDoc=async(ref,data)=>{const id='created-'+window.notes.length;window.notes.push({...data,id});window.writes++;emit();return{id}};
    export const updateDoc=async(id,data)=>{Object.assign(window.notes.find(n=>n.id===id),data);window.writes++;emit()};
    export const deleteDoc=async(id)=>{window.notes=window.notes.filter(n=>n.id!==id);window.writes++;emit()};
  `,
}
const result = await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './app/dashboard/note-interne/page';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:null);b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'tsx',resolveDir:process.cwd()}))}}]})
const browser=await chromium.launch({headless:true,...(existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? {channel:'chrome'} : {})})
try {
 for(const role of ['admin','tehnician','dispecer','client',null]) {
  const page=await browser.newPage({viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://procedures.test/**',r=>r.fulfill({contentType:'text/html',body:'<html><head></head><body><div id="root"></div></body></html>'}))
  await page.goto('https://procedures.test/')
  await page.evaluate(role=>{
   window.role=role;window.reads=0;window.writes=0;window.toasts=[];window.stamp={toDate:()=>new Date('2026-11-11')};
   const note=(id,title,content,parentId)=>({id,title,content,parentId,category:'general',authorName:'Admin',authorId:'test',createdAt:window.stamp,updatedAt:window.stamp});
   window.notes=[note('root','Acces și siguranță','<p>Procedura principală</p>'),note('child','Verificare poartă','<p>Instrucțiuni secundare</p>','root'),note('leaf','Verificare senzori','<p>Oprește <strong>alimentarea electrică</strong> înainte de lucru.</p>','child'),note('legacy','Procedură existentă','Text vechi')];
  },role)
  if(process.env.PROCEDURES_TEST_CSS) await page.addStyleTag({content:readFileSync(process.env.PROCEDURES_TEST_CSS,'utf8')})
  await page.addScriptTag({content:result.outputFiles[0].text})
  if(role==='client'||!role){await expect(page.getByRole('navigation',{name:'Cuprins proceduri'})).toHaveCount(0);assert.equal(await page.evaluate(()=>window.reads),0);await page.close();continue}
  const nav=page.getByRole('navigation',{name:'Cuprins proceduri'}),article=page.getByRole('article',{name:'Conținut procedură'})
  await expect(nav.getByRole('button',{name:'Verificare poartă',exact:true})).toHaveCount(0)
  await nav.getByRole('button',{name:'Extinde Acces și siguranță'}).click()
  await nav.getByRole('button',{name:'Verificare poartă',exact:true}).click()
  await expect(article).toContainText('Instrucțiuni secundare')
  await nav.getByRole('button',{name:'Restrânge Acces și siguranță'}).click()
  await expect(nav.getByRole('button',{name:'Verificare poartă',exact:true})).toHaveCount(0)
  const search=page.getByRole('textbox',{name:'Caută în toate procedurile'})
  await search.fill('alimentarea electrica')
  await expect(nav.getByRole('button',{name:'Verificare senzori',exact:true})).toBeVisible()
  await expect(article).toContainText('Oprește alimentarea electrică')
  await article.getByRole('button',{name:'Acces și siguranță',exact:true}).click()
  await expect(article).toContainText('Procedura principală')
  await nav.getByRole('button',{name:'Verificare senzori',exact:true}).click()
  await expect(article).toContainText('Oprește alimentarea electrică')
  await search.fill('nu-exista')
  await expect(article).toContainText('Niciun rezultat')
  await search.fill('')
  if(role==='admin'){
   await nav.getByRole('button',{name:'Acces și siguranță',exact:true}).click()
   await page.getByRole('button',{name:'Subelement nou'}).click()
   await expect(page.getByLabel('Element principal',{exact:true})).toHaveValue('root')
   await page.getByLabel('Titlu *',{exact:true}).fill('Subelement de test')
   const editor=page.locator('.tiptap');await expect(editor).toBeVisible();await editor.fill('Conținut nou')
   await page.getByRole('button',{name:'Creează procedura',exact:true}).click()
   await expect(page.getByRole('dialog')).toHaveCount(0)
   await expect(article).toContainText('Subelement de test')
   assert.equal(await page.evaluate(()=>window.notes.find(n=>n.title==='Subelement de test').parentId),'root')
   await page.getByRole('button',{name:'Editează',exact:true}).click()
   assert.equal(await page.getByLabel('Element principal',{exact:true}).locator('option[value="created-4"]').count(),0)
   await page.getByLabel('Element principal',{exact:true}).selectOption('')
   await page.getByRole('button',{name:'Salvează modificările'}).click()
   assert.equal(await page.evaluate(()=>window.notes.find(n=>n.title==='Subelement de test').parentId),null)
   await nav.getByRole('button',{name:'Acces și siguranță',exact:true}).click()
   await page.getByRole('button',{name:'Editează',exact:true}).click()
   const options=await page.getByLabel('Element principal',{exact:true}).locator('option').evaluateAll(items=>items.map(n=>n.value))
   assert(!options.includes('root')&&!options.includes('child')&&!options.includes('leaf'))
   await page.getByRole('button',{name:'Șterge procedura',exact:true}).click()
   await expect(page.getByRole('dialog')).toBeVisible()
   assert.equal(await page.evaluate(()=>window.writes),2)
   assert.equal(await page.evaluate(()=>window.toasts.at(-1).title),'Procedura are subelemente')
   await page.getByRole('button',{name:'Anulează',exact:true}).click()
  }else{
   await expect(page.getByRole('button',{name:'Procedură nouă',exact:true})).toHaveCount(0)
   await expect(page.getByRole('button',{name:'Editează',exact:true})).toHaveCount(0)
   assert.equal(await page.evaluate(()=>window.writes),0)
  }
  if(process.env.PROCEDURES_TEST_CSS){
   const n=await nav.boundingBox(),a=await article.boundingBox();assert(n.x+n.width<=a.x+1,'Desktop contents sit to the left of the procedure');
   if(role==='admin') await page.screenshot({path:'/tmp/fom-procedures-desktop.png',fullPage:true});
   await page.setViewportSize({width:390,height:844});
   await expect.poll(async()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   const heading=await article.getByRole('heading',{level:1}).boundingBox();assert(heading.width>200,'Mobile title retains a readable width');
   const mobileNav=await nav.boundingBox(),mobileArticle=await article.boundingBox();assert(mobileNav.y+mobileNav.height<=mobileArticle.y+1);
   if(role==='admin') await page.screenshot({path:'/tmp/fom-procedures-mobile.png',fullPage:true});
  }
  assert.deepEqual(errors,[])
  await page.close()
 }
 console.log('PASS: real page/editor: nested navigation, collapse, global content search, create/reparent, cycle/delete guards, internal read-only roles and client exclusion (mock Firestore).')
} finally {await browser.close()}
