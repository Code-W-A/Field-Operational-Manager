const firstNonEmpty=(values:any[])=>values.find(v=>String(v || "").trim()) || "";
import { collection,doc,getDoc,getDocs } from "firebase/firestore";
import {db} from "@/lib/firebase/config";
import {renderRevisionOperationsPDF,renderRevisionEquipmentPDF} from "./revision-render";
async function loadLiveClientData(work: any): Promise<any | null> {
  const clientId = firstNonEmpty([
    work?.clientId,
    work?.clientInfo?.id,
    work?.clientInfo?.clientId,
  ])
  if (!clientId) return null
  try {
    const snap = await getDoc(doc(db, "clienti", String(clientId)))
    if (!snap.exists()) return null
    return snap.data() as any
  } catch {
    return null
  }
}

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const resp = await fetch("/nrglogo.png")
    const blob = await resp.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generateRevisionOperationsPDF(lucrareId:string):Promise<Blob>{const work=(await getDoc(doc(db,"lucrari",lucrareId))).data();const revisions=(await getDocs(collection(db,"lucrari",lucrareId,"revisions"))).docs.map(d=>({id:d.id,...d.data()}));return renderRevisionOperationsPDF(lucrareId,work,revisions,await loadLiveClientData(work),await loadLogoDataUrl());}
export async function generateRevisionEquipmentPDF(lucrareId:string,equipmentId:string,opts?:{headerLabelOverride?:string;sheetNumberLabel?:string}):Promise<Blob>{const work=(await getDoc(doc(db,"lucrari",lucrareId))).data(),snap=await getDoc(doc(db,"lucrari",lucrareId,"revisions",equipmentId));return renderRevisionEquipmentPDF(lucrareId,equipmentId,work,snap.exists()?{id:snap.id,...snap.data()}:null,await loadLiveClientData(work),await loadLogoDataUrl(),opts);}
