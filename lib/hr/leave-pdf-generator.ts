import jsPDF from "jspdf"
import type { Employee, LeaveRequest } from "./types"
import { getEmployeeFullName } from "./types"

// Font românesc pentru diacritice (folosim font standard care suportă caractere speciale)
const COMPANY_NAME = "NRG Access Systems SRL"
const COMPANY_CIF = "RO34272913"
const COMPANY_REG = "J23/991/2015"

export function generateLeaveRequestPDF(
  request: LeaveRequest,
  employee: Employee,
  availableDays: number,
  remainingDays: number
) {
  const doc = new jsPDF()
  
  // Dimensiuni pagină
  const pageWidth = doc.internal.pageSize.width
  const pageHeight = doc.internal.pageSize.height
  const margin = 20
  
  // Header - Companie
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text(COMPANY_NAME, margin, 25)
  
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`Cod fiscal: ${COMPANY_CIF}`, margin, 32)
  doc.text(`Nr. de inregistrare: ${COMPANY_REG}`, margin, 38)
  
  // Titlu
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  const title = "CERERE DE CONCEDIU DE ODIHNA"
  const titleWidth = doc.getTextWidth(title)
  doc.text(title, (pageWidth - titleWidth) / 2, 70)
  
  // Linie separator
  doc.setLineWidth(0.5)
  doc.line(margin, 75, pageWidth - margin, 75)
  
  // Conținut cerere
  doc.setFontSize(11)
  doc.setFont("helvetica", "normal")
  
  let yPos = 95
  
  // Text principal
  const mainText = `Subsemnatul/a ${getEmployeeFullName(employee)}, cu functia de ${employee.title || "Tehnician Montaj"}, in cadrul ${COMPANY_NAME}, va rog sa imi aprobati concediul legal de odihna pentru anul ${new Date(request.startDate).getFullYear()}, incepand cu data de ${formatDate(request.startDate)} pana la ${formatDate(request.endDate)}, respectiv ${calculateWorkDays(request.startDate, request.endDate)} zile lucratoare.`
  
  const splitText = doc.splitTextToSize(mainText, pageWidth - 2 * margin)
  doc.text(splitText, margin, yPos)
  
  yPos += splitText.length * 7 + 15
  
  // Text explicativ
  const explainText = "Am luat la cunostinta, faptul ca intreruperea concediului de odihna se poate face pentru nevoi de serviciu neprevazute si urgente in baza unei dispozitii scrise a angajatorului."
  const splitExplain = doc.splitTextToSize(explainText, pageWidth - 2 * margin)
  doc.text(splitExplain, margin, yPos)
  
  yPos += splitExplain.length * 7 + 15
  
  // Zile disponibile
  doc.setFont("helvetica", "bold")
  doc.text(`Zile de concediu disponibile: ${availableDays}`, margin, yPos)
  yPos += 10
  doc.text(`Zile de concediu care vor ramane dupa efectuarea prezentului concediu: ${remainingDays}`, margin, yPos)
  
  // Status
  yPos += 20
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  const statusColor = request.status === "approved" ? [34, 197, 94] : 
                      request.status === "rejected" ? [239, 68, 68] : 
                      [234, 179, 8]
  doc.setTextColor(statusColor[0], statusColor[1], statusColor[2])
  doc.text(`Status: ${request.status === "approved" ? "APROBAT" : request.status === "rejected" ? "RESPINS" : "IN ASTEPTARE"}`, margin, yPos)
  
  // Reset color
  doc.setTextColor(0, 0, 0)
  
  // Data cererii
  yPos = pageHeight - 40
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("DATA:", margin, yPos)
  doc.setFont("helvetica", "normal")
  doc.text(formatDate(new Date().toISOString().split('T')[0]), margin, yPos + 7)
  
  // Semnătură (spațiu pentru)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("Semnatura angajat:", pageWidth - 80, yPos)
  doc.line(pageWidth - 80, yPos + 8, pageWidth - margin, yPos + 8)
  
  // Motiv dacă există
  if (request.reason) {
    yPos += 20
    doc.setFontSize(9)
    doc.setFont("helvetica", "italic")
    doc.text(`Motiv: ${request.reason}`, margin, yPos)
  }
  
  // Footer
  doc.setFontSize(8)
  doc.setTextColor(128, 128, 128)
  doc.text(`Generat automat la ${new Date().toLocaleString('ro-RO')}`, margin, pageHeight - 15)
  
  // Salvare PDF
  const fileName = `Cerere_Concediu_${getEmployeeFullName(employee).replace(/\s/g, '_')}_${request.startDate}.pdf`
  doc.save(fileName)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

function calculateWorkDays(startStr: string, endStr: string): number {
  const start = new Date(startStr)
  const end = new Date(endStr)
  let count = 0
  const current = new Date(start)
  
  while (current <= end) {
    const day = current.getDay()
    // Exclude weekends (0 = Sunday, 6 = Saturday)
    if (day !== 0 && day !== 6) {
      count++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return count
}

