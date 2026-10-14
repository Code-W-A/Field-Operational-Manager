import { assertPayload } from "./payload-validation";
import test from 'node:test';
import assert from 'node:assert/strict';
import { revisionCheck, revisionChecksComplete, revisionEquipmentVerified, validateRevision } from './index';
import type { RevisionSection } from './index';
const sections:RevisionSection[]=[{id:'s',title:'Secțiune',items:[{id:'i',label:'Control'},{id:'na',label:'Vechi',state:'na'}]}];
test('untouched point is incomplete; checking/unchecking maps to canonical states and preserves N/A',()=>{
 assert(!revisionChecksComplete(sections));const checked=revisionCheck(sections,'i',true);assert(revisionChecksComplete(checked));assert.equal(checked[0].items[1].state,'na');const unchecked=revisionCheck(checked,'i',false);assert.equal(unchecked[0].items[0].state,'nefunctional');assert(revisionChecksComplete(unchecked));assert.equal(sections[0].items[0].state,undefined);
});
test('manual items can be deleted after saving; canonical points cannot be removed',()=>{
 const expected=[{id:'s',title:'Secțiune',items:[{id:'i',label:'Control'},{id:'manual-old',label:'Manual',state:'functional' as const}]}];
 const supplied=[{id:'s',title:'Secțiune',items:[{id:'i',label:'Control',state:'functional' as const}]}];
 assert.equal(validateRevision(supplied,expected,{customItems:true})[0].items.length,1);
 assert.throws(()=>validateRevision([{...supplied[0],items:[]}],expected,{customItems:true}));
});
test('draft validation allows unanswered points; full save does not',()=>{assert.equal(validateRevision(sections,sections,{draft:true,customItems:true})[0].items[0].state,undefined);assert.throws(()=>validateRevision(sections,sections,{customItems:true}));});
test('QR verification requires a server time, not an empty marker',()=>{assert(!revisionEquipmentVerified({revisionEquipmentTimes:{eq:{}}},'eq'));assert(revisionEquipmentVerified({revisionEquipmentTimes:{eq:{verifiedAt:'2026-10-14T11:00:00Z'}}},'eq'));});
test('revision command limits combined transported photo metadata to four',()=>{
 const base={equipmentId:'eq',sections:revisionCheck(sections,'i',true),photos:Array.from({length:4},(_,i)=>({id:`p${i}`}))};
 assertPayload({action:'revision.save',payload:base} as any);assert.throws(()=>assertPayload({action:'revision.save',payload:{...base,photos:[...base.photos,{id:'fifth'}]}} as any));
});
