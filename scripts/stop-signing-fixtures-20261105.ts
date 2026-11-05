/** Fixtures for the approved stop-and-sign physical tests. Read-only unless --apply is supplied. */
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { validateWorkEquipmentForCreation } from "../lib/utils/work-equipment-validation";

async function main() {
  loadEnvConfig(process.cwd());
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "field-operational-manager");
  assert(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
  const app = initializeApp({ credential: cert({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL, privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g, "\n") }) });
  const db = getFirestore(app);
  const run = "test-stop-signing-20261105", uid = "h8QLAs0DI7a7qCUKd3BTv0ranfu1", clientId = "iqdwDWrk8eeyyZdv3Zn7", actorId = "RG9sLP8j00XkIjJ8ZMf63SAbXS32";
  const specs = [
    {key:"paid",type:"Intervenție contra cost"}, {key:"installation",type:"Instalare"}, {key:"revision",type:"Revizie"},
  ].map(s=>({...s,id:`${run}-${s.key}`,description:`TEST OPRIRE ȘI SEMNARE — ${s.type} — SET 05.11.2026`}));
  const sameFixture = (d:any,spec:typeof specs[number]) => d?.clientId === clientId && d?.descriere === spec.description && d?.tipLucrare === spec.type && d?.createdBy === actorId && d?.tehnicieni?.join() === "Tehnician";
  try {
    const [cs,us,as] = await db.getAll(db.doc(`clienti/${clientId}`),db.doc(`users/${uid}`),db.doc(`users/${actorId}`));
    const client=cs.data()!,user=us.data()!,actor=as.data()!;
    assert.equal(client.nume,"Client test edit"); assert.equal(user.email,"mobitoolsro@gmail.com"); assert.equal(user.displayName,"Tehnician"); assert.equal(user.role,"tehnician"); assert.notEqual(user.disabled,true); assert.equal(actor.role,"admin");
    const location=client.locatii.find((x:any)=>x.id==="id_mj7dbe9g_j0f41tu5"), eq=location?.echipamente.find((x:any)=>x.id==="temp-1750700945326-sjco7peop"), contact=location?.persoaneContact.find((x:any)=>x.id==="id_mj7dbe9g_xta4b05b");
    assert.equal(location?.nume,"Locatie de test 10"); assert.equal(eq?.nume,"asda"); assert.equal(eq?.cod,"asda2123"); assert(contact?.email);
    const refs=specs.map(s=>db.doc(`lucrari/${s.id}`)), existing=await db.getAll(...refs);
    existing.forEach((snap,i)=>{ if(snap.exists) assert(sameFixture(snap.data(),specs[i]),`Occupied ID: ${snap.id}`); });
    console.log(JSON.stringify({mode:process.argv.includes("--apply")?"apply":"dry-run",client:client.nume,user:user.email,location:location.nume,code:eq.cod,existing:existing.filter(s=>s.exists).map(s=>s.id),requested:specs.length}));
    if(!process.argv.includes("--apply"))return;
    const now=new Date().toISOString();
    assert.equal(new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Bucharest",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now)),"2026-11-05","This dated fixture must not schedule a later day accidentally");
    const directory=`/Users/code-with-a/Dev/FOM/test-artifacts/${run}`;
    await mkdir(directory,{recursive:true});
    const counter=db.doc("numarRaport/document-numar-raport"), reservation=db.doc(`logs/${run}`);
    const beforeCounter=(await counter.get()).data();
    await writeFile(`${directory}/before.json`,JSON.stringify({client:{id:clientId,name:client.nume,locationId:location.id,equipmentId:eq.id,code:eq.cod},user:{uid,email:user.email,name:user.displayName},counter:beforeCounter,tickets:existing.map(s=>({id:s.id,exists:s.exists,data:s.data()||null}))},null,2),{mode:0o600,flag:"wx"}).catch((e:any)=>{if(e.code!=="EEXIST")throw e;});
    const numbers=await db.runTransaction(async tx=>{
      const previous=await tx.get(reservation);
      if(previous.exists){ assert.deepEqual(previous.data()!.workIds,specs.map(s=>s.id)); return previous.data()!.numbers as string[]; }
      const snap=await tx.get(counter), n=Number(snap.data()?.numarRaport||1);
      assert(Number.isSafeInteger(n)&&n>0);
      const assigned=specs.map((_,i)=>`#${String(n+i).padStart(6,"0")}`);
      tx.set(counter,{numarRaport:n+specs.length},{merge:true});
      tx.create(reservation,{action:"User-authorized manual test set, one ticket per type",actorId,clientId,uid,numbers:assigned,workIds:specs.map(s=>s.id),createdAt:Timestamp.now()});
      return assigned;
    });
    const settings=(await db.collection("settings").get()).docs.map(d=>({...d.data(),id:d.id}));
    const {installationService}=await import("../lib/installations/service");
    for(let i=0;i<specs.length;i++){
      const spec=specs[i];
      if(existing[i].exists){assert.equal(existing[i].data()?.nrLucrare,numbers[i]);continue;}
      const common:any={clientId,locationId:location.id,locationName:location.nume,client:client.nume,locatie:location.nume,contactId:contact.id,persoanaContact:contact.nume,persoanaContactEmail:contact.email,telefon:contact.telefon,equipmentIds:[eq.id],tehnicieni:[user.displayName],technicianIds:[uid],tipLucrare:spec.type,statusLucrare:"Atribuită",statusFacturare:"Nefacturat",preluatDispecer:false,echipament:eq.nume,echipamentId:eq.id,echipamentCod:eq.cod,descriere:spec.description,defectReclamat:spec.description,nrLucrare:numbers[i],dataEmiterii:now,dataInterventie:now,createdBy:actorId,createdByName:actor.displayName};
      const validation=validateWorkEquipmentForCreation(common);assert(validation.valid,validation.valid?"":validation.message);
      if(spec.key==="installation"){
        await installationService(db).create({uid:actorId,role:actor.role},common,spec.id);
        await db.runTransaction(async tx=>{const snap=await tx.get(refs[i]);assert(sameFixture(snap.data(),spec));if(snap.data()?.technicianIds?.join()===uid)return;assert(!snap.data()?.installation?.startedEquipmentIds?.length);tx.update(refs[i],{technicianIds:[uid]});});
      }else{
        if(spec.key==="revision")Object.assign(common,{echipament:"",echipamentId:"",echipamentCod:"",revision:{checklistVersionId:JSON.stringify(settings),equipmentStatus:{[eq.id]:"pending"},doneCount:0}});
        try{await refs[i].create({...common,equipmentVerified:false,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});}catch(e:any){if(e.code!==6)throw e;assert(sameFixture((await refs[i].get()).data(),spec));}
      }
    }
    const after=await db.getAll(...refs);
    after.forEach((snap,i)=>{const d=snap.data()!;assert(sameFixture(d,specs[i]));assert.equal(d.nrLucrare,numbers[i]);assert.equal(d.statusLucrare,"Atribuită");assert.deepEqual(d.technicianIds,[uid]);assert.deepEqual(d.equipmentIds,[eq.id]);assert.equal(d.locationId,location.id);assert(!d.timpSosire&&!d.timpPlecare&&!d.raportGenerat&&!d.semnaturaTehnician&&!d.semnaturaBeneficiar);if(specs[i].key==="installation"){assert.equal(d.installation.schemaVersion,1);assert.equal(d.installation.equipmentStatus[eq.id],"pending");assert.equal(d.installation.startedEquipmentIds.length,0);}if(specs[i].key==="revision"){assert(d.revision.checklistVersionId);assert.equal(d.revision.equipmentStatus[eq.id],"pending");}});
    const {technicianService}=await import("../lib/technician/service");
    const bundle=await technicianService(db).bundle(uid);
    const visible=specs.map(s=>bundle.works.find(w=>w.id===s.id));assert(visible.every(Boolean));
    const manifest=after.map((snap,i)=>({id:snap.id,key:specs[i].key,number:snap.data()!.nrLucrare,type:specs[i].type,status:snap.data()!.statusLucrare,clientId,locationId:location.id,equipmentId:eq.id,uid,mobileVisible:true}));
    await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2),{mode:0o600});
    console.log(JSON.stringify({verified:manifest,count:manifest.length,unstarted:true,mobileVisible:true}));
  }finally{await deleteApp(app);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
