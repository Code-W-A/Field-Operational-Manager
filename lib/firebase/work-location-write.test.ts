import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Execute the actual add/update write boundaries with an isolated Firestore transport.
async function boundary() {
  const mocks: Record<string, string> = {
    'firebase/firestore': `
      export const doc=(db,...parts)=>parts.join('/'); export const collection=doc;
      export const query=(ref,...args)=>ref; export const where=()=>null; export const limit=()=>null;
      export const orderBy=()=>null; export const startAfter=()=>null; export const serverTimestamp=()=> 'now';
      export const getDoc=async ref=>globalThis.locationFixture.snapshot(ref);
      export const getDocFromServer=async ref=>{globalThis.locationFixture.serverReads.push(ref);if(globalThis.locationFixture.offline)throw Error('offline');return globalThis.locationFixture.snapshot(ref)};
      export const getDocs=async()=>({docs:[]});export const getDocsFromServer=getDocs;
      export const updateDoc=async(ref,data)=>globalThis.locationFixture.writes.push({ref,data});
      export const addDoc=async(ref,data)=>{if(ref==='lucrari')globalThis.locationFixture.writes.push({ref,data});return {id:'new'}};
      export const deleteDoc=()=>{};export const getCountFromServer=()=>{};export const writeBatch=()=>{};`,
    './firebase': `export const db={};`,
    '@/lib/crm/technician-client': `export const technicianCrmCommand=()=>{};`,
    '@/lib/utils/work-modifications-tracker': `export const trackLucrareUpdate=()=>{};export const getLucrareTitle=()=>'';`,
    '@/lib/client-contacts': `export const deriveLegacyPrimaryClientContact=()=>{};export const ensureClientContactIds=x=>x;`,
  }
  const result = await build({ entryPoints:['lib/firebase/firestore.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'isolated-transport',setup(b){
    b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:'mock'}:args.kind==='dynamic-import'?{path:args.path,external:true}:undefined)
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}))
  }}] })
  const module = { exports: {} as any }; new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,require)
  return module.exports
}

test('actual Firebase creation/edit boundaries reject legacy names before writing and allow unrelated updates', async () => {
  const api = await boundary()
  const client={id:'client',nume:'Monsanto',locatii:[{id:'loc-id',nume:'Cladire Admin',echipamente:[{id:'eq'}]}]}
  const legacy={clientId:'client',client:'Monsanto',locationId:'Cladire Admin',locatie:'Cladire Admin',tipLucrare:'Revizie',equipmentIds:['eq']}
  const state:any={writes:[],serverReads:[],offline:false,snapshot:(ref:string)=>({id:ref.split('/').pop(),exists:()=>true,data:()=>ref.startsWith('clienti/')?client:legacy})}
  ;(globalThis as any).locationFixture=state
  await assert.rejects(api.addLucrare({...legacy}), /Locația/)
  assert.equal(state.writes.length,0)
  await assert.rejects(api.updateLucrare('work',{locationId:'Cladire Admin'}), /Locația/)
  assert.equal(state.writes.length,0)
  await api.updateLucrare('work',{notificationRead:true},undefined,undefined,true)
  assert.equal(state.writes.length,1)
  assert.deepEqual(state.writes.pop().data,{notificationRead:true})
  await api.updateLucrare('work',{locationId:'loc-id'})
  assert.equal(state.writes.pop().data.locationId,'loc-id')
  state.offline=true
  await assert.rejects(api.addLucrare({...legacy,locationId:'loc-id'}),/offline/)
  assert.equal(state.writes.length,0)
  assert.ok(state.serverReads.includes('clienti/client'))
  delete (globalThis as any).locationFixture
})
