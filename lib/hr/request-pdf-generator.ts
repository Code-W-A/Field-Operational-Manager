import jsPDF from "jspdf"
import type { HrRequest } from "@/lib/hr/types"
import { hrRequestDateLabel, hrRequestKindLabel, hrRequestStatusLabel } from "@/lib/hr/hr-requests"

const COMPANY_NAME = "NRG Access Systems SRL"

function formatNowRo() {
  try {
    return new Date().toLocaleString("ro-RO")
  } catch {
    return new Date().toISOString()
  }
}

export function generateHrRequestPDF(request: HrRequest) {
  const doc = new jsPDF()
  const margin = 20
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height

  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.text(COMPANY_NAME, margin, 20)

  doc.setFontSize(16)
  const title = `CERERE: ${hrRequestKindLabel(request.kind).toUpperCase()}`
  const titleWidth = doc.getTextWidth(title)
  doc.text(title, (pageWidth - titleWidth) / 2, 50)

  doc.setLineWidth(0.5)
  doc.line(margin, 55, pageWidth - margin, 55)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)

  let y = 75
  const lines: string[] = []
  lines.push(`Angajat: ${request.employeeName || request.employeeId}`)
  lines.push(`Sector: ${request.sectorId || "—"}`)
  lines.push(`Perioadă/zi: ${hrRequestDateLabel(request)}`)
  lines.push(`Status: ${hrRequestStatusLabel(request.status)}`)

  const payloadReason = (request.payload as any)?.reason
  if (payloadReason) lines.push(`Motiv: ${String(payloadReason)}`)
  if (request.status === "rejected" && request.rejectionReason) lines.push(`Motiv respingere: ${request.rejectionReason}`)

  const text = lines.join("\n")
  const wrapped = doc.splitTextToSize(text, pageWidth - 2 * margin)
  doc.text(wrapped, margin, y)

  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  doc.text(`Generat automat la ${formatNowRo()}`, margin, pageHeight - 12)
  doc.setTextColor(0, 0, 0)

  const safeName = (request.employeeName || request.employeeId || "angajat").replace(/\s+/g, "_")
  const fileName = `Cerere_${request.kind}_${safeName}_${Date.now()}.pdf`
  doc.save(fileName)
}

