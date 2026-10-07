import { auth } from "@/lib/firebase/config";
import type { InstallationDocument } from "@/types/installation";
import { renderInstallationPdf } from "./installation-render";
export { renderInstallationPdf } from "./installation-render";
export async function downloadInstallationPdf(snapshot: InstallationDocument, workId: string, sheetId?: string) {
 const token = await auth.currentUser?.getIdToken();
 const doc = await renderInstallationPdf(snapshot,workId,sheetId,async photo => {
  const response=await fetch(`/api/lucrari/${encodeURIComponent(workId)}/installation/photos?sheetId=${encodeURIComponent(sheetId!)}&photoId=${encodeURIComponent(photo.id)}`,{headers:token?{Authorization:`Bearer ${token}`}:{},credentials:"same-origin",cache:"no-store"});
  if(!response.ok) throw new Error("Fotografia nu a putut fi inclusă în PDF.");
  return new Uint8Array(await response.arrayBuffer());
 });
 doc.save(`${sheetId ? "Fisa_montaj" : "Proces_verbal_instalare"}_${(sheetId || workId).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`);
}
