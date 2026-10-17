import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
const bundle = await build({
  stdin: { contents: `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{EquipmentCatalogFields}from'./components/equipment/equipment-catalog-fields';import{EquipmentCatalogManager}from'./components/equipment/equipment-catalog-manager';function Fixture(){const[data,setData]=useState({producator:'',model:'Legacy model'});return <><input aria-label="Ciornă"/><input aria-label="Fotografie" type="file"/><EquipmentCatalogFields {...data} canAdd={window.role!=='tehnician'} onChange={patch=>setData(prev=>({...prev,...patch}))}/><output aria-label="Echipament">{JSON.stringify(data)}</output>{window.role==='admin'&&<EquipmentCatalogManager/>}</>;}createRoot(document.getElementById('root')).render(<Fixture/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: {'process.env.NODE_ENV':'"test"'},
  plugins: [{name:'auth',setup(b){b.onResolve({filter:/^@\/lib\/firebase\/config$/},()=>({path:'auth',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:`export const auth={currentUser:{getIdToken:async()=> 'fixture'}};`,loader:'js'}));}}],
});
const browser = await chromium.launch({headless:true,channel:'chrome'});
let checks=0;
try {
  for(const role of ['admin','dispecer','tehnician']) {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.route('https://catalog.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
    let fail=false,postCalls=0,sequence=0;
    const catalog={manufacturers:[{id:'nice',name:'Nice'},{id:'came',name:'Came'}],models:[{id:'nice-model',name:'M400',manufacturerId:'nice'},{id:'came-model',name:'C900',manufacturerId:'came'}]};
    await page.route('**/api/equipment-catalog*',async r=>{
      const req=r.request(), manage=req.url().includes('manage=1');
      if(req.method()!=='GET') {
        const data=req.postDataJSON();
        if(req.method()==='POST') {
          postCalls++;
          if(fail){fail=false;return r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Rețea indisponibilă'})});}
          if(data.kind==='models')assert(catalog.manufacturers.some(option=>option.id===data.manufacturerId));
          const option={id:`new-${++sequence}`,name:data.name.trim(),...(data.kind==='models'?{manufacturerId:data.manufacturerId}:{})};
          catalog[data.kind].push(option);
          return r.fulfill({contentType:'application/json',body:JSON.stringify({option,catalog})});
        }
        const option=catalog[data.kind].find(option=>option.id===data.id);assert(option);Object.assign(option,data);
        return r.fulfill({contentType:'application/json',body:JSON.stringify({option,catalog})});
      }
      const active=catalog.manufacturers.filter(option=>!option.hidden);
      const result=manage?catalog:{manufacturers:active,models:catalog.models.filter(option=>!option.hidden&&active.some(manufacturer=>manufacturer.id===option.manufacturerId))};
      return r.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    });
    await page.goto('https://catalog.test');await page.evaluate(role=>window.role=role,role);await page.addScriptTag({content:bundle.outputFiles[0].text});
    const manufacturer=page.getByRole('combobox',{name:'Producător',exact:true}), model=page.getByRole('combobox',{name:'Model',exact:true});
    await expect(manufacturer).toBeEnabled();await expect(model).toBeDisabled();await expect(model).toHaveText(/Legacy model/);
    await page.getByLabel('Ciornă').fill('Datele rămân');await page.getByLabel('Fotografie').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
    if(role==='tehnician') {await expect(page.getByRole('button',{name:'Adaugă model',exact:true})).toHaveCount(0);} else {await expect(page.getByRole('button',{name:'Adaugă model',exact:true})).toBeDisabled();}
    await manufacturer.click();await page.getByRole('listbox').getByRole('option',{name:'Nice',exact:true}).click();await expect(model).toBeEnabled();await expect(model).toHaveText(/Nespecificat/);
    await model.click();await expect(page.getByRole('listbox').getByRole('option',{name:'C900',exact:true})).toHaveCount(0);await page.getByRole('listbox').getByRole('option',{name:'M400',exact:true}).click();
    await manufacturer.click();await page.getByRole('listbox').getByRole('option',{name:'Came',exact:true}).click();await expect(model).toHaveText(/Nespecificat/);
    await model.click();await expect(page.getByRole('listbox').getByRole('option',{name:'M400',exact:true})).toHaveCount(0);await page.getByRole('listbox').getByRole('option',{name:'C900',exact:true}).click();checks+=3;
    if(role!=='tehnician') {
      await page.getByRole('button',{name:'Adaugă producător',exact:true}).first().click();await page.getByRole('button',{name:'Anulează',exact:true}).click();
      await page.getByRole('button',{name:'Adaugă producător',exact:true}).first().click();await page.getByLabel('Denumire',{exact:true}).fill('New producer');fail=true;
      await page.getByRole('button',{name:'Adaugă și selectează',exact:true}).click();await expect(page.getByRole('alert')).toHaveText('Rețea indisponibilă');await expect(page.getByLabel('Denumire',{exact:true})).toHaveValue('New producer');
      await page.getByRole('button',{name:'Adaugă și selectează',exact:true}).click();await expect(manufacturer).toHaveText(/New producer/);await expect(model).toBeEnabled();await expect(model).toHaveText(/Nespecificat/);
      assert.equal(catalog.models.filter(option=>option.manufacturerId==='new-1').length,0);assert.equal(postCalls,2);
      await page.getByRole('button',{name:'Adaugă model',exact:true}).click();await page.getByLabel('Denumire',{exact:true}).fill('New model');await page.getByRole('button',{name:'Adaugă și selectează',exact:true}).click();await expect(model).toHaveText(/New model/);
      assert.equal(catalog.models.find(option=>option.name==='New model').manufacturerId,'new-1');checks+=3;
      if(role==='admin') {
        await page.getByLabel('Producător administrat',{exact:true}).selectOption('new-1');
        const panel=page.getByLabel('Modele pentru New producer',{exact:true});await expect(panel).toContainText('New model');
        await page.getByRole('button',{name:'Adaugă model pentru New producer',exact:true}).click();await page.getByLabel('Denumire',{exact:true}).fill('From settings');await page.getByRole('button',{name:'Salvează denumirea',exact:true}).click();
        await expect(page.getByRole('dialog')).toHaveCount(0);await model.click();await page.getByRole('listbox').getByRole('option',{name:'From settings',exact:true}).click();await expect(model).toHaveText(/From settings/);
        await page.getByRole('button',{name:'Ascunde modelul New model',exact:true}).click();await expect(panel).toContainText('New model (ascuns)');
        await model.click();await expect(page.getByRole('listbox').getByRole('option',{name:'New model',exact:true})).toHaveCount(0);await page.getByRole('listbox').getByRole('option',{name:'Nespecificat',exact:true}).click();checks+=3;
      }
    }
    await manufacturer.click();await page.getByRole('listbox').getByRole('option',{name:'Nespecificat',exact:true}).click();await expect(model).toBeDisabled();await expect(model).toHaveText(/Nespecificat/);
    await expect(page.getByLabel('Ciornă')).toHaveValue('Datele rămân');assert.equal(await page.getByLabel('Fotografie').evaluate(el=>el.files.length),1);checks++;
    await page.close();
  }
  console.log(`${checks} catalog browser scenarios passed: producer/model dependency, shared Settings/+ source, roles, legacy values, retry and draft/photo retention (mock HTTP).`);
} finally {await browser.close();}
