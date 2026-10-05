import { jsPDF } from "jspdf"
import { auth } from "@/lib/firebase/config"
import { drawSimpleHeader, drawFooter, MARGIN, CONTENT_WIDTH } from "./common"
import { ensurePdfFont } from "./font-loader"
import type { InstallationDocument } from "@/types/installation"

export async function downloadInstallationPdf(snapshot: InstallationDocument, workId: string, sheetId?: string) {
  const doc = new jsPDF()
  await ensurePdfFont(doc)
  let y = drawSimpleHeader(doc, { title: sheetId ? "Fișă de montaj" : "Proces-verbal de terminare a lucrării" })
  doc.setFont("NotoSans", "normal").setTextColor(25, 25, 25).setFontSize(10)
  const room = (height: number) => { if (y + height > 272) { doc.addPage(); y = MARGIN + 5 } }
  const line = (label: string, value: string) => {
    const lines = doc.splitTextToSize(`${label}${label ? ": " : ""}${value || "—"}`, CONTENT_WIDTH - 8)
    for (const row of lines) { room(6); doc.text(row, MARGIN + 4, y); y += 5 }
    y += 2
  }
  line("Tichet", snapshot.workNumber)
  line("Document", sheetId || "Proces-verbal final")
  line("Data lucrării", snapshot.workDate)
  line("Client", snapshot.client.client)
  line("CUI", snapshot.client.clientInfo.cui)
  line("Locație", `${snapshot.client.locatie} ${snapshot.client.clientInfo.locationAddress}`)
  snapshot.equipment.forEach(e => line("Echipament", `${e.name} · ${e.code}${e.model ? ` · ${e.model}` : ""}`))
  if (sheetId) {
    line("Constatare la locație", snapshot.finding || "")
    line("Operațiuni executate", snapshot.operations || "")
    line("Status instalare", ({ in_progress: "În lucru", blocked: "Blocat", completed: "Finalizat" })[snapshot.installationStatus || "in_progress"])
    if (snapshot.installationStatus === "blocked") line("Motivul blocajului", snapshot.blockReason || "")
  } else {
    line("Obiect", "Terminarea instalării echipamentelor enumerate, conform fișelor de montaj de mai jos.")
    snapshot.sheetReferences?.forEach(s => line("Fișă de montaj", `${s.workDate} · ${s.equipmentName} · ${s.sheetId}`))
    if (snapshot.observations) line("Observații finale", snapshot.observations)
  }
  const token = await auth.currentUser?.getIdToken()
  for (const photo of snapshot.photos) {
    const url = `/api/lucrari/${encodeURIComponent(workId)}/installation/photos?sheetId=${encodeURIComponent(sheetId!)}&photoId=${encodeURIComponent(photo.id)}`
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: "same-origin", cache: "no-store" })
    if (!response.ok) throw new Error("O fotografie nu a putut fi inclusă în PDF. Reîncercați descărcarea.")
    const bytes = new Uint8Array(await response.arrayBuffer())
    const properties = doc.getImageProperties(bytes)
    const width = Math.min(CONTENT_WIDTH - 8, 150)
    const height = Math.min(100, width * properties.height / properties.width)
    const actualWidth = height * properties.width / properties.height
    room(height + 12)
    line("Fotografie", photo.name)
    doc.addImage(bytes, photo.contentType === "image/png" ? "PNG" : "JPEG", MARGIN + 4, y, actualWidth, height)
    y += height + 5
  }
  const halfWidth = (CONTENT_WIDTH - 12) / 2
  const technicianLabel = doc.splitTextToSize(`Tehnician: ${snapshot.technicianName}`, halfWidth)
  const beneficiaryLabel = doc.splitTextToSize(`Beneficiar: ${snapshot.beneficiaryName}`, halfWidth)
  const labelHeight = Math.max(technicianLabel.length, beneficiaryLabel.length) * 5
  room(labelHeight + 32)
  doc.text(technicianLabel, MARGIN + 4, y)
  doc.text(beneficiaryLabel, MARGIN + 8 + halfWidth, y)
  doc.addImage(snapshot.technicianSignature, "PNG", MARGIN + 4, y + labelHeight + 3, 70, 22)
  doc.addImage(snapshot.beneficiarySignature, "PNG", MARGIN + 8 + halfWidth, y + labelHeight + 3, 70, 22)
  for (let i = 1; i <= doc.getNumberOfPages(); i++) { doc.setPage(i); drawFooter(doc) }
  doc.save(`${sheetId ? "Fisa_montaj" : "Proces_verbal_instalare"}_${(sheetId || workId).replace(/[^a-zA-Z0-9_-]/g, "")}.pdf`)
}
