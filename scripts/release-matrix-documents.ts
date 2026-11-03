/** Read-only rendering of official test snapshots; no delivery or ticket mutation. */
import { loadEnvConfig } from '@next/env';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
async function main() {
 loadEnvConfig(process.cwd());
 if(process.env.FIRESTORE_EMULATOR_HOST || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!=='field-operational-manager')throw Error('Wrong project');
 const db=getFirestore(initializeApp({credential:cert({projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,clientEmail:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,privateKey:process.env.FIREBASE_ADMIN_PRIVATE_KEY!.replace(/\\n/g,'\n')})}));
 try {
 const dir='../test-artifacts/release-matrix-20261102';
 const manifest=JSON.parse(await readFile(dir+'/manifest.json','utf8'));
 const { servicePdf, workDocument } = await import('../lib/technician/documents');
 await mkdir(dir+'/pdf',{recursive:true});
 for(const row of manifest){
  const snap=await db.doc('lucrari/'+row.id).get(),w={id:snap.id,...snap.data()} as any;
  if(w.clientId!=='iqdwDWrk8eeyyZdv3Zn7'||w.technicianIds?.join()!=='h8QLAs0DI7a7qCUKd3BTv0ranfu1')throw Error('Scope mismatch');
  if(row.key==='installation') {
   const sheets=await db.doc('lucrari/'+row.id).collection('installationSheets').get();
   for(const sheet of sheets.docs) if(sheet.data().documentSnapshot) {
    const pdf=await workDocument(db,{uid:row.uid,role:'tehnician'},row.id,sheet.id);
    await writeFile(`${dir}/pdf/${row.key}-${row.mode}-sheet.pdf`,pdf,{mode:0o600});
   }
   if(w.statusLucrare==='Finalizat') {
    const pdf=await workDocument(db,{uid:row.uid,role:'tehnician'},row.id);
    await writeFile(`${dir}/pdf/${row.key}-${row.mode}-completion.pdf`,pdf,{mode:0o600});
   }
   continue;
  }
  if(!w.raportGenerat)continue;
  if(row.key==='revision') await writeFile(`${dir}/pdf/${row.key}-${row.mode}-operations.pdf`,await workDocument(db,{uid:row.uid,role:"tehnician"},row.id,undefined,"all"),{mode:0o600});
  const pdf=await servicePdf(db,w);await writeFile(`${dir}/pdf/${row.key}-${row.mode}.pdf`,pdf,{mode:0o600});
  console.log(JSON.stringify({ticket:row.number,bytes:pdf.length,source:'official frozen snapshot, local renderer',email:w.lastReportEmail?.status}));
 }
 }finally{await db.terminate()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
