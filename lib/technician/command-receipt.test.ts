import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { attendanceReceipt } from './command-receipt';
const fingerprint=JSON.stringify({mutationId:'op-1',action:'attendance.start',payload:{private:'never return'}});
function db(data: any) { const paths:string[]=[];return {paths,db:{collection:(c:string)=>({doc:(id:string)=>({get:async()=>{paths.push(`${c}/${id}`);return {exists:!!data,data:()=>data}}})})} as any}; }
test('read-only lookup is scoped to authenticated uid and returns digest only',async()=>{const f=db({uid:'alice',fingerprint,result:{secret:'private'}});const r=await attendanceReceipt(f.db,'alice','op-1');assert.deepEqual(f.paths,['mobileCommands/alice_op-1']);assert.equal(r.state,'confirmed');assert.equal(r.commandDigest,createHash('sha256').update(fingerprint).digest('hex'));assert.ok(!JSON.stringify(r).includes('private'));});
test('absent is not rejected; owner mismatch and non-attendance receipts fail closed',async()=>{assert.equal((await attendanceReceipt(db(null).db,'bob','op-1')).state,'absent');await assert.rejects(()=>attendanceReceipt(db({uid:'alice',fingerprint}).db,'bob','op-1'));await assert.rejects(()=>attendanceReceipt(db({uid:'alice',fingerprint:JSON.stringify({mutationId:'op-1',action:'installation'})}).db,'alice','op-1'));});
test('invalid IDs never reach firestore',async()=>{for(const id of ['', '../alice_op-1','a/b']){const f=db(null);await assert.rejects(()=>attendanceReceipt(f.db,'alice',id));assert.equal(f.paths.length,0)}});
