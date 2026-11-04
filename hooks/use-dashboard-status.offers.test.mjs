/** Exercises the real hook with in-memory collections; no Firebase/network access. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
const require = createRequire(import.meta.url)
const mocks = {
  '@/contexts/AuthContext': 'export const useAuth = () => ({ userData: { role: "admin" } });',
  '@/hooks/use-firebase-collection': `export function useFirebaseCollection(name, constraints = []) {
    const fixture = globalThis.__offerTestFixture;
    const archived = constraints.some(c => c?.[0] === 'statusLucrare' && c?.[1] === '==');
    return { data: name === 'lucrari' ? (archived ? [] : fixture.works) : fixture[name] || [], loading: false };
  }`,
  'firebase/firestore': `export const where = (...x) => x; export const orderBy = (...x) => x;
    export const limit = n => n; export const Timestamp = { fromDate: d => d };`,
}
const bundled = await build({
  stdin: { contents: `
    import React from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {useDashboardStatus} from './hooks/use-dashboard-status';
    export function run(fixture, settings = {}) {
      globalThis.__offerTestFixture = fixture;
      let result;
      function Probe() { result = useDashboardStatus({statusOferteEnabled:true,statusOferteIncludeAccept:true,statusOferteIncludeReject:true,
        ofertateEnabled:true,ofertateRequireHasOffer:true,ofertateRequireNoResponse:true,
        listateEnabled:true,listateRequireNoTechnicians:true,...settings}); return null; }
      renderToStaticMarkup(React.createElement(Probe));
      delete globalThis.__offerTestFixture;
      return result;
    }
  `, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'cjs',
  external: ['react', 'react-dom/server'],
  plugins: [{ name: 'isolated-collections', setup(b) {
    b.onResolve({ filter: /.*/ }, args => mocks[args.path] ? { path: args.path, namespace: 'fixture' } : undefined)
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }))
  } }],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', bundled.outputFiles[0].text)(require, module, module.exports)
const { run } = module.exports

const base = { id:'original', statusLucrare:'Listată', tehnicieni:[],
  offerTotal:100, offerResponse:{status:'accept',at:'2026-11-04T08:00:00Z'} }
const ids = bucket => bucket.map(item => item.id)
const indicators = [
  {reinterventieLansata:true},
  {reinterventieLansataAt:'2026-11-04T09:00:00Z'},
  {reinterventieLucrareId:'child'},
  {reinterventii:['child']},
  {reinterventiiCount:1},
]
for (const indicator of indicators) {
  test(`accepted offer is hidden with ${Object.keys(indicator)[0]}, preserving other buckets and data`, () => {
    const works = [{...base,...indicator}]
    const before = structuredClone(works)
    const {buckets} = run({works})
    assert.deepEqual(ids(buckets.statusOferte), [])
    assert.deepEqual(ids(buckets.listate), ['original'])
    assert.deepEqual(works, before)
  })
}
test('accepted offer stays visible without a created reintervention, including empty historical fields', () => {
  const {buckets} = run({works:[{...base,reinterventieLansata:false,reinterventieLansataAt:null,
    reinterventieLucrareId:'',reinterventii:[],reinterventiiCount:0}]})
  assert.deepEqual(ids(buckets.statusOferte), ['original'])
})
test('rejected and unanswered offers remain visible with every reintervention indicator', () => {
  for (const indicator of indicators) {
    const {buckets} = run({works:[
      {...base,...indicator,id:'rejected',offerResponse:{status:'reject'}},
      {...base,...indicator,id:'unanswered',offerResponse:undefined},
    ]})
    assert.deepEqual(ids(buckets.statusOferte), ['rejected'])
    assert.deepEqual(ids(buckets.ofertate), ['unanswered'])
  }
})
test('a new collection snapshot hides only the accepted original after reintervention creation', () => {
  const initial = {...base}
  assert.deepEqual(ids(run({works:[initial]}).buckets.statusOferte), ['original'])
  // Opening the form writes no launch indicator to the original ticket.
  assert.deepEqual(ids(run({works:[initial]}).buckets.statusOferte), ['original'])
  const updated = {...initial,reinterventieLansata:true,reinterventieLucrareId:'child'}
  const child = {id:'child',lucrareOriginala:'original',statusLucrare:'Listată',tehnicieni:[]}
  const {buckets} = run({works:[updated,child]})
  assert.deepEqual(ids(buckets.statusOferte), [])
  assert.deepEqual(ids(buckets.listate), ['original','child'])
})
test('offer category switches still control visibility', () => {
  assert.deepEqual(run({works:[base]},{statusOferteIncludeAccept:false}).buckets.statusOferte, [])
  assert.deepEqual(run({works:[base]},{statusOferteEnabled:false}).buckets.statusOferte, [])
})
