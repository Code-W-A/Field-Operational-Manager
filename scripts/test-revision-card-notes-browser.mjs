/** Real hook and presentation; controlled subscription events, no production access. */
import { build } from 'esbuild'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const postcss = require('postcss')
const tailwind = require('tailwindcss')
const css = await postcss([tailwind({ content: ['./components/revision-card-notes.tsx'], corePlugins: { preflight: true } })])
  .process('@tailwind base; @tailwind utilities;', { from: undefined })
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {useRevisionCardNotes} from './hooks/use-revision-card-notes';
    import {RevisionCardNotes} from './components/revision-card-notes';
    window.listeners=[];
    function App(){
      const [role,setRole]=useState('admin'), [work,setWork]=useState('w'), [mounted,setMounted]=useState(true);
      window.setRole=setRole; window.setWork=setWork; window.unmount=()=>setMounted(false);
      return mounted ? <Cards role={role} work={work}/> : null;
    }
    function Cards({role,work}){
      const notes=useRevisionCardNotes(work,'Revizie',role);
      return <main style={{width:'100%',maxWidth:600}}>
        {notes.loading && <p role="status">Se încarcă</p>}
        {notes.error && <div role="alert">Eroare<button onClick={notes.retry}>Reîncearcă</button></div>}
        {['a','b','c'].map(id=><article data-testid={id} key={id}>
          <h4>{id}</h4>{notes.enabled && <RevisionCardNotes sheet={notes.sheets[id]}/>}
        </article>)}
      </main>;
    }
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
  plugins: [{ name: 'controlled-subscription', setup(build) {
    build.onResolve({ filter: /^@\/lib\/firebase\/revisions$/ }, () => ({ path: 'subscription', namespace: 'fixture' }))
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
      export function subscribeRevisionsForWork(workId, next, error) {
        const entry={workId,next,error,active:true}; window.listeners.push(entry);
        return ()=>{entry.active=false};
      }`, loader: 'js' }))
  } }],
})
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type','text/javascript'); res.end(bundle.outputFiles[0].text) }
  else { res.setHeader('Content-Type','text/html'); res.end(`<style>${css.css}</style><div id="root"></div><script src="/bundle.js"></script>`) }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${server.address().port}`)
  await expect.poll(() => page.evaluate(() => window.listeners.length)).toBe(1)
  const sheets = {
    a: { sections: [{ title: 'Mecanică', items: [{label:'Balamale',obs:'Înlocuire piesă\nVerificare ulterioară'}, {label:'Gol',obs:'  '}] }], finalObservations: 'Recomandare finală', internalNote:'SECRET' },
    b: { sections: [], finalObservations:'Doar finale' },
    c: { sections: [], finalObservations:' \n ' },
  }
  const emit = data => page.evaluate(data => window.listeners.at(-1).next(data), data)
  await emit(sheets)
  await expect(page.getByTestId('a')).toContainText('Mecanică / Balamale')
  await expect(page.getByTestId('a')).toContainText('Recomandare finală')
  await expect(page.getByTestId('b')).not.toContainText('Balamale')
  await expect(page.getByTestId('b').getByText('Observații la verificări')).toHaveCount(0)
  await expect(page.getByTestId('c').getByLabel('Observații fișă de revizie')).toHaveCount(0)
  await expect(page.getByText('SECRET')).toHaveCount(0)
  sheets.a.finalObservations = ''; await emit(sheets)
  await expect(page.getByTestId('a').getByText('Observații finale',{exact:true})).toHaveCount(0)
  const long = 'TextLung'.repeat(150)
  sheets.a.sections[0].items[0].obs = long + '\nrând doi'; await emit(sheets)
  for (const width of [1280,375]) {
    await page.setViewportSize({width,height:900})
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    assert.equal(await page.getByTestId('a').locator('li p').last().evaluate(el=>getComputedStyle(el).whiteSpace),'pre-wrap')
    await expect(page.getByTestId('a')).toContainText(long)
  }
  await emit({}); await expect(page.getByLabel('Observații fișă de revizie')).toHaveCount(0)
  await page.evaluate(() => window.listeners.at(-1).error(new Error('denied')))
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button',{name:'Reîncearcă'}).click()
  await expect.poll(() => page.evaluate(() => window.listeners.length)).toBe(2)
  assert.equal(await page.evaluate(() => window.listeners.filter(x=>x.active).length),1)
  await emit(sheets); await expect(page.getByRole('alert')).toHaveCount(0)
  await page.evaluate(() => window.setRole('client'))
  await expect(page.getByLabel('Observații fișă de revizie')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.listeners.filter(x=>x.active).length)).toBe(0)
  assert.equal(await page.evaluate(() => window.listeners.length),2)
  for (const role of ['dispecer','tehnician','admin']) {
    await page.evaluate(role => window.setRole(role),role)
    await expect.poll(() => page.evaluate(() => window.listeners.filter(x=>x.active).length)).toBe(1)
    await emit(sheets); await expect(page.getByTestId('a')).toContainText(long)
  }
  await page.evaluate(() => window.setWork('w2'))
  await expect.poll(() => page.evaluate(() => window.listeners.at(-1).workId)).toBe('w2')
  await expect(page.getByLabel('Observații fișă de revizie')).toHaveCount(0)
  await page.evaluate(data => window.listeners[0].next(data),sheets)
  await expect(page.getByLabel('Observații fișă de revizie')).toHaveCount(0)
  await emit({b:sheets.b}); await expect(page.getByTestId('b')).toContainText('Doar finale')
  await page.evaluate(() => window.unmount())
  await expect.poll(() => page.evaluate(() => window.listeners.filter(x=>x.active).length)).toBe(0)
  assert.deepEqual(errors,[])
  console.log('PASS notes, empty fields, multiline, desktop/mobile overflow, updates/deletion, retry, role gating, ticket change and listener cleanup (controlled subscription).')
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)) }
