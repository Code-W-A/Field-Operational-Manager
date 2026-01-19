import jsPDF from "jspdf"
import type { HrRequest } from "@/lib/hr/types"
import { hrRequestKindLabel, hrRequestStatusLabel } from "@/lib/hr/hr-requests"
import { formatRomanianDateDotsISO, formatRomanianDateTime } from "@/lib/utils/date-utils"

const COMPANY_NAME = "NRG Access Systems SRL"

function requestDateLabelDots(req: HrRequest) {
  const p: any = req.payload as any
  if (p?.startDate && p?.endDate) {
    return `${formatRomanianDateDotsISO(p.startDate)} → ${formatRomanianDateDotsISO(p.endDate)}`
  }
  if (p?.date && p?.startTime && p?.endTime) {
    return `${formatRomanianDateDotsISO(p.date)} • ${p.startTime}–${p.endTime}`
  }
  if (p?.date) return formatRomanianDateDotsISO(p.date) || String(p.date)
  return "—"
}

export function generateHrRequestPdfBuffer(
  request: HrRequest,
  opts?: { departmentName?: string }
): { buffer: Buffer; filename: string } {
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

  const lines: string[] = []
  lines.push(`Angajat: ${request.employeeName || request.employeeId}`)
  lines.push(`Departament: ${opts?.departmentName || request.sectorId || "—"}`)
  lines.push(`Perioadă/zi: ${requestDateLabelDots(request)}`)
  lines.push(`Status: ${hrRequestStatusLabel(request.status)}`)

  const payloadReason = (request.payload as any)?.reason
  if (payloadReason) lines.push(`Motiv: ${String(payloadReason)}`)
  if (request.status === "rejected" && request.rejectionReason) lines.push(`Motiv respingere: ${request.rejectionReason}`)

  const text = lines.join("\n")
  const wrapped = doc.splitTextToSize(text, pageWidth - 2 * margin)
  doc.text(wrapped, margin, 75)

  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  doc.text(`Generat automat la ${formatRomanianDateTime(new Date())}`, margin, pageHeight - 12)
  doc.setTextColor(0, 0, 0)

  const safeName = (request.employeeName || request.employeeId || "angajat").replace(/\s+/g, "_")
  const fileName = `Cerere_${request.kind}_${safeName}_${Date.now()}.pdf`
  const arrayBuffer = doc.output("arraybuffer")
  return { buffer: Buffer.from(arrayBuffer), filename: fileName }
}

