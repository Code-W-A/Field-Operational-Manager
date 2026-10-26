import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeIntervention } from './intervention-merge';
import { saveInterventionWithRecovery, InterventionConflict } from './intervention-recovery';
const base = { tipLucrare:'Intervenție contra cost', echipamentCod:'EQ', descriereInterventie:'Inițial', notaInternaTehnician:'', updatedAt:'v1' };
const conflict = () => Object.assign(new Error('Tichetul a fost modificat. Ciorna este păstrată.'), {kind:'conflict'});
test('unrelated edits preserve both local and remote fields', () => {
  const r = mergeIntervention(base, {descriereInterventie:'Reparație'}, {...base,notaInternaTehnician:'Dispecer',telefon:'123',updatedAt:'v2'});
  assert.deepEqual(r.conflicts, []); assert.equal(r.merged.descriereInterventie,'Reparație'); assert.equal(r.merged.notaInternaTehnician,'Dispecer');
});
test('same field changed differently requires explicit resolution', () => {
  assert.deepEqual(mergeIntervention(base,{descriereInterventie:'Local'},{...base,descriereInterventie:'Remote'}).conflicts,['descriereInterventie']);
});
test('convergent edits and empty defaults do not conflict', () => {
  assert.deepEqual(mergeIntervention(base,{descriereInterventie:'La fel',necesitaOferta:false},{...base,descriereInterventie:'La fel',notaInternaTehnician:'Nou'}).conflicts,[]);
});
test('offer and warranty decisions are atomic groups', () => {
  const b = {...base,necesitaOferta:true,comentariiOferta:'A',tehnicianGarantieDecizie:'nu_intra',tehnicianGarantieNuIntraMotiv:'A'};
  assert.deepEqual(mergeIntervention(b,{comentariiOferta:'B',tehnicianGarantieNuIntraMotiv:'B'}, {...b,necesitaOferta:false,tehnicianGarantieDecizie:'confirma'}).conflicts,['necesitaOferta','garantie']);
});
const photo=(id:string, extra={})=>({id,url:`https://example.test/${id}`,...extra});
test('photos merge additions and deletions without resurrection or duplicates', () => {
  const b={imaginiDefecte:[photo('a'),photo('b')]};
  const result=mergeIntervention(b,{imaginiDefecte:[photo('b'),photo('c')]},{imaginiDefecte:[photo('a'),photo('d')]});
  assert.deepEqual(result.conflicts,[]); assert.deepEqual(result.merged.imaginiDefecte.map((p:any)=>p.id).sort(),['c','d']);
});
test('photo deletion versus edit requires resolution', () => {
  assert.deepEqual(mergeIntervention({imaginiDefecte:[photo('a')]},{imaginiDefecte:[]},{imaginiDefecte:[photo('a',{name:'changed'})]}).conflicts,['imaginiDefecte']);
});
test('merging beyond four photos requires resolution', () => {
  assert.deepEqual(mergeIntervention({imaginiDefecte:[]},{imaginiDefecte:['a','b','c'].map(x=>photo(x))},{imaginiDefecte:['d','e'].map(x=>photo(x))}).conflicts,['imaginiDefecte']);
});
test('recovery retries once against the fresh server version', async () => {
  const calls:any[]=[];
  const result=await saveInterventionWithRecovery(base,{descriereInterventie:'Local'},async (p,w)=>{calls.push([p,w]); if(calls.length===1)throw conflict(); return 'ok';},async()=>({...base,updatedAt:'v2',notaInternaTehnician:'Remote'}));
  assert.equal(result,'ok'); assert.equal(calls[1][1].updatedAt,'v2'); assert.equal(calls[1][0].notaInternaTehnician,'Remote');
});
test('a second concurrent edit cannot bypass the server guard', async () => {
  let count=0;
  await assert.rejects(saveInterventionWithRecovery(base,{},async()=>{count++;throw conflict()},async()=>({...base,updatedAt:'v2'})));
  assert.equal(count,2);
});
test('real conflict never sends a second write', async () => {
  let count=0;
  await assert.rejects(saveInterventionWithRecovery(base,{descriereInterventie:'Local'},async()=>{count++;throw conflict()},async()=>({...base,descriereInterventie:'Remote'})),InterventionConflict);
  assert.equal(count,1);
});
test('equipment changes cannot be automatically rebased', async () => {
  let count=0;
  await assert.rejects(saveInterventionWithRecovery(base,{},async()=>{count++;throw conflict()},async()=>({...base,echipamentCod:'OTHER'})),/identificare/);
  assert.equal(count,1);
});
test('locked, withdrawn, network and validation errors are never rebased', async () => {
  for(const kind of ['blocked','retryable','validation','conflict']) {
    let read=false;
    await assert.rejects(saveInterventionWithRecovery(base,{},async()=>{throw Object.assign(new Error('Tichetul nu mai permite modificări.'),{kind})},async()=>{read=true;return base}));
    assert.equal(read,false);
  }
});
