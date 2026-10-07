import { getStorage } from "firebase-admin/storage";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Firestore } from "firebase-admin/firestore";
import { renderRevisionOperationsPDF,renderRevisionEquipmentPDF } from "@/lib/pdf/revision-render";
import { renderServiceReport } from "@/lib/pdf/service-report";
import { renderInstallationPdf } from "@/lib/pdf/installation-render";
import { installationService } from "@/lib/installations/service";
import { mobileService, MobileError } from "./service";
import { assigned, type Actor } from "@/packages/fom-domain";
import { withDocumentClientSnapshot } from "@/lib/work-documents/document-client-snapshot";
export const bucket=()=>getStorage().bucket();
export async function servicePdf(db: Firestore,work: any) {
  const frozen=withDocumentClientSnapshot({...work,...work.raportSnapshot},work.raportSnapshot?.clientSnapshot);
  const doc=await renderServiceReport(frozen,{logo:`data:image/png;base64,${(await readFile(path.join(process.cwd(),"public/nrglogo.png"))).toString("base64")}`,readOnly:true,image:async url => {
    // Canonical images must resolve to this Firebase bucket; arbitrary URLs are never fetched server-side.
    const u=new URL(url),match=u.pathname.match(/\/o\/(.+)$/);
    if(u.hostname!=="firebasestorage.googleapis.com" && !(process.env.FIREBASE_STORAGE_EMULATOR_HOST && u.host===process.env.FIREBASE_STORAGE_EMULATOR_HOST)) throw new MobileError("Sursa fotografiei nu este permisă.");
    const filePath=match?decodeURIComponent(match[1]):"";
    if(!filePath) throw new MobileError("Fotografie invalidă.");
    const [bytes]=await bucket().file(filePath).download();
    return `data:image/jpeg;base64,${(await sharp(bytes).resize({width:1000,height:1000,fit:"inside",withoutEnlargement:true}).jpeg().toBuffer()).toString("base64")}`;
  },revisions:async()=>work.mobileRevisionSnapshot || work.raportSnapshot?.mobileRevisionSnapshot || (await db.collection("lucrari").doc(work.id).collection("revisions").get()).docs.map(d=>({id:d.id,...d.data()}))});
  return Buffer.from(doc.output("arraybuffer"));
}
export async function workDocument(db: Firestore,a: Actor,workId: string,sheetId?: string,revision?:string) {
  if(!/^[\w-]{1,160}$/.test(workId)) throw new MobileError("Identificator invalid.");
  const snap=await db.collection("lucrari").doc(workId).get(), w={...snap.data(),id:snap.id} as any;
  if(!snap.exists || !assigned(w,a)) throw new MobileError("Document inaccesibil.",403);
  if(w.installation?.schemaVersion===1) {
    const list=await installationService(db).list(a,workId,undefined,sheetId);
    const snapshot=sheetId?list.sheets.find((s:any)=>s.id===sheetId)?.documentSnapshot:list.completion?.documentSnapshot;
    if(!snapshot) throw new MobileError("Documentul nu este încă semnat.",409);
    const doc=await renderInstallationPdf(snapshot,workId,sheetId,async photo => new Uint8Array((await bucket().file(photo.path).download())[0]));
    return Buffer.from(doc.output("arraybuffer"));
  }
  if(revision && w.tipLucrare==="Revizie")return revisionPdf(db,w,revision==="all"?undefined:revision);
  if(!w.raportGenerat) throw new MobileError("Raportul nu este încă generat.",409);
  return servicePdf(db,w);
}

export async function revisionPdf(db:Firestore,work:any,equipmentId?:string) {
 const frozen=withDocumentClientSnapshot({...work,...work.raportSnapshot},work.raportSnapshot?.clientSnapshot);
 const revisions=work.raportSnapshot?.mobileRevisionSnapshot || work.mobileRevisionSnapshot || (await db.collection("lucrari").doc(work.id).collection("revisions").get()).docs.map(d=>({id:d.id,...d.data()}));
 const logo=`data:image/png;base64,${(await readFile(path.join(process.cwd(),"public/nrglogo.png"))).toString("base64")}`;
 const blob=equipmentId?await renderRevisionEquipmentPDF(work.id,equipmentId,frozen,revisions.find((r:any)=>r.id===equipmentId),null,logo):await renderRevisionOperationsPDF(work.id,frozen,revisions,null,logo);
 return Buffer.from(await blob.arrayBuffer());
}
