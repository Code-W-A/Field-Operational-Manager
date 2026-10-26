/** Explicitly mutating smoke test, restricted to the user's existing disposable TEST MOBIL tickets. */
import assert from 'node:assert/strict';
import { loadEnvConfig } from '@next/env';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Timestamp } from 'firebase-admin/firestore';
import { deleteApp } from 'firebase-admin/app';
import { saveInterventionWithRecovery, InterventionConflict } from '../lib/technician/intervention-recovery';
import { versionOf, interventionPatch, equipmentFor, checklistFromSettings, failureCauses, FOM_CONTRACT_VERSION } from '../packages/fom-domain';
async function main() {
  assert(process.argv.includes('--run'), 'Requires --run; modifies only existing TEST MOBIL fixtures.');
  loadEnvConfig(process.cwd());
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,'field-operational-manager');
  assert(!process.env.FIRESTORE_EMULATOR_HOST);
  const {adminDb:db,adminApp}=await import('../lib/firebase/admin');
  const {technicianService}=await import('../lib/technician/service');
  const {installationService}=await import('../lib/installations/service');
  const svc=technicianService(db), installation=installationService(db);
  const clientId='iqdwDWrk8eeyyZdv3Zn7';
  const client=(await db.doc(`clienti/${clientId}`).get()).data()!;
  assert.equal(client.nume,'Client test edit');
  // Validate the entire disposable batch before the first mutation; cleanup makes this script one-shot.
  const ids = [1,3,4,5,6,7,8,2].flatMap(type => [2,3].map(sample => `mobile-test-20261024-t${type}-n${sample}`));
  const fixtures = await db.getAll(...ids.map(id => db.doc(`lucrari/${id}`)));
  assert(fixtures.every(snapshot => snapshot.exists && snapshot.data()?.clientId === clientId &&
    String(snapshot.data()?.defectReclamat).startsWith('TEST MOBIL —') &&
    snapshot.data()?.statusLucrare === 'Atribuită'), 'Expected an untouched complete batch of 16 disposable tickets.');
  const settings=(await db.collection('settings').get()).docs.map(d=>({id:d.id,...d.data()}));
  const cause=failureCauses(settings)[0]; assert(cause);
  const results:any[]=[];
  try {
    for(const type of [1,3,4,5,6,7,8,2]) for(const sample of [2,3]) {
      const id=`mobile-test-20261024-t${type}-n${sample}`, ref=db.doc(`lucrari/${id}`);
      const read=async()=> (await ref.get()).data()!;
      const initial=await read();
      assert.equal(initial.clientId,clientId); assert.match(initial.defectReclamat,/^TEST MOBIL —/);
      assert.equal(initial.tehnicieni.join(','),'Tehnician');
      assert(!initial.raportDataLocked, 'Never overwrite finalized fixtures');
      const uid=initial.technicianIds[0]; const actor=await svc.actor(uid);
      const run=async(action:any,payload:any,work?:any)=>{
        try {return await svc.command(uid,{contractVersion:FOM_CONTRACT_VERSION,mutationId:randomUUID(),action,entityId:id,payload,baseVersion:versionOf(work||await read()),occurredAt:new Date().toISOString()},'web')}
        catch(error){ if((error as any).status===409) (error as any).kind='conflict'; throw error }
      };
      const location=client.locatii.find((l:any)=>l.id===initial.locationId || l.nume===initial.locatie);
      const eq=equipmentFor(initial,location)[0]; assert(eq?.code);
      const baseline={id,...initial};
      await writeFile(`/tmp/fom-conflict-check/${id}-before.json`,JSON.stringify(baseline),{mode:0o600});
      if(type===2) {
        await assert.rejects(installation.start(actor,id,{equipmentId:eq.id,qrRaw:'WRONG-TEST',requestId:randomUUID()}));
        const started=await installation.start(actor,id,{equipmentId:eq.id,qrRaw:eq.code,requestId:randomUUID()});
        const fields={finding:'TEST automat: constatare',operations:'TEST automat: salvare instalare',installationStatus:'in_progress',blockReason:'',internalNote:'TEST verificare flux'};
        const saved=await installation.save(actor,id,{sheetId:started.sheet.id,revision:started.sheet.revision,fields,requestId:randomUUID()});
        const stopped=await installation.stop(actor,id,{sheetId:saved.sheet.id,revision:saved.sheet.revision,fields,requestId:randomUUID()});
        assert.equal(stopped.sheet.state,'awaiting_signature');
        results.push({id,type:initial.tipLucrare,qr:true,save:true,stop:true});
      } else {
        await assert.rejects(run('verify',{code:'WRONG-TEST',...(type===8?{equipmentId:eq.id}:{})}));
        await run('verify',{code:eq.code,...(type===8?{equipmentId:eq.id}:{})});
        if(type===8) {
          const sections=(eq.rootId?checklistFromSettings(settings,eq.rootId):[]).map(s=>({...s,items:s.items.map(i=>({...i,checked:true,state:'functional',observations:''}))}));
          await run('revision.save',{equipmentId:eq.id,sections,draft:true,photos:[],finalObservations:'TEST ciornă revizie'});
          await run('revision.save',{equipmentId:eq.id,sections,photos:[],finalObservations:'TEST revizie verificată'});
          assert.equal((await ref.collection('revisions').doc(eq.id).get()).data()?.overallState,'functional');
        }
        const base=await read();
        const data={constatareLaLocatie:'TEST automat: constatare',descriereInterventie:'TEST automat: intervenție',statusEchipament:'Funcțional',cauzaPrincipalaDefectId:cause.id,cauzaPrincipalaDefect:cause.label,necesitaOferta:false,comentariiOferta:'',imaginiDefecte:[],...(type===4?{tehnicianGarantieDecizie:'confirma'}:{})};
        // A disjoint change must survive recovery, including a second ordinary save.
        await ref.update({notaInternaTehnician:'TEST modificare independentă',updatedAt:Timestamp.now()});
        const send=(payload:any,work:any)=>run('intervention.save',interventionPatch(payload,work),work);
        const saved=await saveInterventionWithRecovery(base,data,send,read);
        assert.equal((await read()).notaInternaTehnician,'TEST modificare independentă');
        await send({...saved.work,descriereInterventie:'TEST a doua salvare'},saved.work);
        const overlappingBase=await read();
        await ref.update({descriereInterventie:'TEST editare concurentă',updatedAt:Timestamp.now()});
        await assert.rejects(saveInterventionWithRecovery(overlappingBase,{...data,descriereInterventie:'TEST ciornă locală'},send,read),InterventionConflict);
        assert.equal((await read()).descriereInterventie,'TEST editare concurentă');
        // Explicit test resolution, then stop without signing or sending any email.
        await send({...data,descriereInterventie:'TEST verificare completă'},await read());
        await run('report.later',{products:[]});
        assert.equal((await read()).statusLucrare,'Fără semnătură');
        results.push({id,type:initial.tipLucrare,qr:true,save:true,recovery:true,conflictProtected:true,reportLater:true});
      }
      console.log(JSON.stringify(results.at(-1)));
      await writeFile('/tmp/fom-conflict-check/real-results.json',JSON.stringify(results,null,2));
    }
  } finally { await deleteApp(adminApp); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
