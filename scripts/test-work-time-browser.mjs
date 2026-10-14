import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const bundle = await build({ stdin: {contents: `import {normalizeWorkTimes,romanianWorkDisplay,romanianManualInstant} from './packages/fom-domain/work-time'; import {ticketDate} from '../expo-mobile-app/src/connected/ticket-model'; window.workTime={normalizeWorkTimes,romanianWorkDisplay,romanianManualInstant,ticketDate};`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser'});
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  for(const timezoneId of ['UTC','Europe/Bucharest','America/Los_Angeles']) {
    const context=await browser.newContext({timezoneId});const page=await context.newPage();
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    const result=await page.evaluate(()=>{
      const at='2026-10-14T11:46:00Z', winter='2026-01-14T11:46:00Z';
      const normalized=workTime.normalizeWorkTimes({timpSosire:at,oraSosire:'11:46'});
      let rejected=false;try{workTime.romanianManualInstant('29.03.2026','03:30');}catch{rejected=true;}
      return {web:workTime.romanianWorkDisplay(at),expo:workTime.ticketDate(at,true),winter:workTime.ticketDate(winter,true),time:normalized.oraSosire,manual:workTime.romanianManualInstant('14.10.2026','14:46'),rejected};
    });
    assert.equal(result.web,result.expo);assert(result.web.endsWith('14:46'));assert(result.winter.endsWith('13:46'));assert.equal(result.time,'14:46');assert.equal(result.manual,'2026-10-14T11:46:00.000Z');assert(result.rejected);
    await context.close();
  }
  console.log('Web/Expo chronology passed in 3 browser time zones.');
} finally {await browser.close();}
