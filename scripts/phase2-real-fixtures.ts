/** Explicitly authorized, bounded fixtures. Dry run by default; --apply creates exactly three. */
import { loadEnvConfig } from "@next/env";
import { writeFile, mkdir } from "node:fs/promises";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { validateWorkEquipmentForCreation } from "../lib/utils/work-equipment-validation";
async function main() {
  loadEnvConfig(process.cwd());
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== "field-operational-manager") throw Error("Wrong target");
  const db=getFirestore(initializeApp({credential:cert({projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g,"\n")})}));
  try {
    const uid="h8QLAs0DI7a7qCUKd3BTv0ranfu1", clientId="iqdwDWrk8eeyyZdv3Zn7", actorId="RG9sLP8j00XkIjJ8ZMf63SAbXS32";
    const [clientSnap, userSnap, actorSnap]=await db.getAll(db.doc(`clienti/${clientId}`),db.doc(`users/${uid}`),db.doc(`users/${actorId}`));
    const client=clientSnap.data()!,user=userSnap.data()!,actor=actorSnap.data()!;
    if(client.nume!=="Client test edit"||user.email!=="mobitoolsro@gmail.com"||user.displayName!=="Tehnician"||user.role!=="tehnician"||actor.displayName!=="Andrei"||actor.role!=="admin")throw Error("Fixture identity mismatch");
    const location=client.locatii.find((x:any)=>x.id==="id_mj7dbe9g_j0f41tu5"), eq=location?.echipamente.find((x:any)=>x.id==="temp-1750700945326-sjco7peop"), contact=location?.persoaneContact.find((x:any)=>x.id==="id_mj7dbe9g_xta4b05b");
    if(location?.nume!=="Locatie de test 10"||eq?.cod!=="asda2123"||!contact?.email)throw Error("Equipment/contact mismatch");
    const run="test-offline-phase2-20261030";
    const specs=[{key:"intervention",type:"Intervenție contra cost"},{key:"revision",type:"Revizie"},{key:"installation",type:"Instalare"}].map(s=>({...s,id:`${run}-${s.key}`}));
    const existing=await db.getAll(...specs.map(s=>db.doc(`lucrari/${s.id}`)));
    for (const snap of existing) if(snap.exists && (snap.data()?.clientId!==clientId || !snap.data()?.descriere?.includes(run)))throw Error("Stable identifier is occupied");
    console.log(JSON.stringify({mode:process.argv.includes("--apply")?"apply":"dry-run",project:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,client:client.nume,technician:user.displayName,code:eq.cod,tickets:specs.map((s,i)=>({...s,exists:existing[i].exists,number:existing[i].data()?.nrLucrare}))}));
    if(!process.argv.includes("--apply"))return;
    const directory="/Users/code-with-a/Dev/FOM/test-artifacts/offline-phase2-20261030";
    await mkdir(directory,{recursive:true});
    const counter=db.doc("numarRaport/document-numar-raport"), reservation=db.doc(`logs/${run}`);
    if(!(await reservation.get()).exists)await writeFile(`${directory}/before.json`,JSON.stringify({client:{id:clientId,...client},user:{uid,email:user.email,displayName:user.displayName},counter:(await counter.get()).data(),tickets:existing.map(s=>({id:s.id,exists:s.exists,data:s.data()||null}))},null,2),{mode:0o600,flag:"wx"}).catch((e:any)=>{if(e.code!=="EEXIST")throw e});
    const numbers=await db.runTransaction(async tx=>{const prior=await tx.get(reservation);if(prior.exists)return prior.data()!.numbers as string[];const current=await tx.get(counter),n=Number(current.data()?.numarRaport||1);const numbers=specs.map((_,i)=>`#${String(n+i).padStart(6,"0")}`);tx.set(counter,{numarRaport:n+3},{merge:true});tx.create(reservation,{action:"Test offline phase 2 explicitly authorized",actorId,clientId,uid,numbers,workIds:specs.map(s=>s.id),createdAt:Timestamp.now()});return numbers});
    const settings=(await db.collection("settings").get()).docs.map(d=>({...d.data(),id:d.id}));
    const {installationService}=await import("../lib/installations/service");
    for(let i=0;i<specs.length;i++){
      const spec=specs[i];if(existing[i].exists){if(spec.key==="installation"&&!existing[i].data()?.technicianIds&&existing[i].data()?.tehnicieni?.join()===user.displayName)await existing[i].ref.update({technicianIds:[uid]});continue;}
      const now=new Date().toISOString();
      const common:any={clientId,locationId:location.id,locationName:location.nume,client:client.nume,locatie:location.nume,contactId:contact.id,persoanaContact:contact.nume,persoanaContactEmail:contact.email,telefon:contact.telefon,equipmentIds:[eq.id],tehnicieni:[user.displayName],technicianIds:[uid],tipLucrare:spec.type,statusLucrare:"Atribuită",statusFacturare:"Nefacturat",preluatDispecer:false,echipament:eq.nume,echipamentId:eq.id,echipamentCod:eq.cod,descriere:`TEST OFFLINE FAZA 2 — ${spec.type} — ${run}`,defectReclamat:`TEST OFFLINE FAZA 2 — ${spec.type}`,nrLucrare:numbers[i],dataEmiterii:now,dataInterventie:now,createdBy:actorId,createdByName:actor.displayName};
      const validation=validateWorkEquipmentForCreation(common);if(!validation.valid)throw Error(validation.message);
      if(spec.key==="installation"){
        await installationService(db).create({uid:actorId,role:actor.role},common,spec.id);
        await db.doc(`lucrari/${spec.id}`).update({technicianIds:[uid]});
      }else{
        if(spec.key==="revision")Object.assign(common,{echipament:"",echipamentId:"",echipamentCod:"",revision:{checklistVersionId:JSON.stringify(settings),equipmentStatus:{[eq.id]:"pending"},doneCount:0}});
        await db.doc(`lucrari/${spec.id}`).create({...common,equipmentVerified:false,createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
      }
    }
    const after=await db.getAll(...specs.map(s=>db.doc(`lucrari/${s.id}`)));
    if(after.some(s=>!s.exists||s.data()?.clientId!==clientId||s.data()?.technicianIds?.join()!==uid||s.data()?.tehnicieni?.join()!==user.displayName))throw Error("Verification failed");
    const manifest=after.map(s=>({id:s.id,number:s.data()!.nrLucrare,type:s.data()!.tipLucrare,status:s.data()!.statusLucrare,clientId,locationId:location.id,equipmentId:eq.id,uid}));
    await writeFile(`${directory}/manifest.json`,JSON.stringify(manifest,null,2),{mode:0o600});console.log(JSON.stringify({verified:manifest}));
  }finally{await db.terminate();}
}
main().catch(e=>{console.error(e);process.exitCode=1});
