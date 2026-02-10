import { jsPDF } from "jspdf"
import { collection, doc, getDoc, getDocs } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { drawSimpleHeader, drawFooter, MARGIN, CONTENT_WIDTH } from "./common"
import { ensurePdfFont } from "./font-loader"

type RevisionItem = {
  id: string
  label?: string
  name?: string
  state?: "functional" | "nefunctional" | "na"
  obs?: string
}

type RevisionSection = {
  id: string
  title?: string
  name?: string
  items?: RevisionItem[]
}

type RevisionDoc = {
  id: string
  equipmentId: string
  equipmentName?: string
  name?: string
  title?: string
  label?: string
  checklistName?: string
  templateName?: string
  templateTitle?: string
  revision?: any
  dynamicSettings?: Record<string, any>
  sections?: RevisionSection[]
}

function resolveHeaderLabel(rev: any, sections: RevisionSection[]): string {
  const candidates: (string | undefined)[] = [
    rev?.headerOverride,
    rev?.templateTitle,
    rev?.templateName,
    rev?.checklistName,
    rev?.label,
    rev?.title,
    rev?.name,
    rev?.dynamicSettings?.["revision.checklistParentName"],
    rev?.dynamicSettings?.["revision.templateName"],
    rev?.dynamicSettings?.["revision.checklistName"],
    rev?.["revision.checklistParentName"],
    rev?.["revision.templateName"],
    rev?.["revision.checklistName"],
    rev?.revision?.templateName,
    rev?.revision?.checklistName,
    rev?.equipmentName,
  ]

  const firstNonRoot = sections.find((s: any) => !String(s?.id || "").endsWith("__root"))
  const firstRoot = sections.find((s: any) => String(s?.id || "").endsWith("__root"))
  const sectionFallback =
    (firstNonRoot?.title || firstNonRoot?.name) ||
    (firstRoot && Array.isArray(firstRoot.items) && firstRoot.items.length > 0
      ? (firstRoot.items[0]?.label || firstRoot.items[0]?.name)
      : undefined)

  return normalizeTextForPdf(
    candidates.find((v) => v && String(v).trim().length > 0) ||
      sectionFallback ||
      "Nivel 2 — Fie categorii, fie variabile",
  )
}

// Helper pentru normalizare text cu diacritice corecte
function normalizeTextForPdf(text = ""): string {
  let s = text.normalize("NFC")
  s = s.replace(/\u015F/g, "\u0219").replace(/\u0163/g, "\u021B")
  return s
}

function buildEquipmentSheetHeaderTitle(level2Label: string, sheetNumberLabel?: string): string {
  if (sheetNumberLabel && String(sheetNumberLabel).trim().length > 0) {
    return `Fișa nr. ${sheetNumberLabel} – Lista operațiuni – ${level2Label}`
  }
  return `Lista operațiuni – ${level2Label}`
}

export async function generateRevisionOperationsPDF(lucrareId: string): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" })
  let currentY = MARGIN
  await ensurePdfFont(doc)
  try { doc.setFont("NotoSans", "normal") } catch {}

  // Load lucrare (for client/location context if needed later)
  const workSnap = await getDoc(docRef("lucrari", lucrareId))
  const work = workSnap.exists() ? (workSnap.data() as any) : null

  // Load revisions
  const revCol = collection(db, "lucrari", lucrareId, "revisions")
  const revSnap = await getDocs(revCol)
  const revisions: RevisionDoc[] = revSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))

  // Draw one page per equipment
  const logoUrl = "/nrglogo.png"
  let logoDataUrl: string | null = null
  try {
    const img = await fetch(logoUrl)
    const blob = await img.blob()
    logoDataUrl = await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(blob)
    })
  } catch {}

  const W = CONTENT_WIDTH

  for (let idx = 0; idx < revisions.length; idx++) {
    const rev = revisions[idx]

    // Header: Lista operațiuni – {Nivel 2} (categorie sau primul puncte de control când nu există categorii)
    const sectionsForHeader = Array.isArray(rev.sections) ? rev.sections : []
    const level2Label = resolveHeaderLabel(rev, sectionsForHeader)
    const headerTitle = `Lista operațiuni – ${level2Label}`
    currentY = drawSimpleHeader(doc, {
      title: headerTitle,
      logoDataUrl,
    })

    // Page-break helper cu header repetat si footer centrat
    const checkBreak = (need: number) => {
      const PH = doc.internal.pageSize.getHeight()
      if (currentY + need > PH - MARGIN - 30) {
        drawFooter(doc)
        doc.addPage()
        currentY = drawSimpleHeader(doc, { title: headerTitle, logoDataUrl })
        // Reset text state after header so we don't inherit footer/header styles
        try { doc.setFont("NotoSans", "normal") } catch {}
        doc.setFontSize(9).setTextColor(0, 0, 0)
      }
    }

    // Table header
    const rowH = 8
    // o singura coloana "Verificat"
    const firstColW = Math.round(W * 0.62)
    const verW = 22
    const obsW = W - firstColW - verW

  // Header band
  doc.setFillColor(220, 227, 240)
  doc.rect(MARGIN, currentY, W, rowH, "F")
  try { doc.setFont("NotoSans", "bold") } catch {}
  doc.setFontSize(10).setTextColor(0, 0, 0)
  
  doc.text(normalizeTextForPdf("Puncte de control"), MARGIN + 2, currentY + 5)
  // O singura coloana "Verificat"
  doc.text(normalizeTextForPdf("Verificat"), MARGIN + firstColW + verW / 2, currentY + 5, { align: "center" } as any)
  doc.text(normalizeTextForPdf("Obs."), MARGIN + firstColW + verW + 2, currentY + 5)
  
  currentY += rowH

    const sections = Array.isArray(rev.sections) ? rev.sections : []

    // Helper pentru măsurarea înălțimii unui item (folosit ca să evităm ruperea secțiunilor pe pagini)
    const measureItemHeight = (it: any): number => {
      const label = normalizeTextForPdf(it.label || it.name || "-")
      const obs = normalizeTextForPdf(it.obs || "")
      const labelLines = doc.splitTextToSize(label, firstColW - 4)
      const obsLines = obs ? doc.splitTextToSize(obs, obsW - 4) : []
      const numLines = Math.max(labelLines.length, obsLines.length || 0)
      const lineHeight = 4 // aproximativ pentru fontSize 9
      const baseRow = 8
      const dynamic = numLines > 1 ? 5 + (numLines - 1) * lineHeight : baseRow
      return Math.max(baseRow, dynamic)
    }

    for (const s of sections) {
      const sectionTitle = normalizeTextForPdf(s.title || s.name || "Secțiune")
      const items = Array.isArray(s.items) ? s.items : []

      // Înălțimea totală a secțiunii (header + toate item-urile)
      const sectionHeight = rowH + items.reduce((sum, it) => sum + measureItemHeight(it), 0)
      // Dacă nu încape întreaga secțiune pe pagină, mutăm pe pagina următoare
      checkBreak(sectionHeight)

      // Section row (category)
      doc.setFillColor(240, 240, 240)
      doc.rect(MARGIN, currentY, W, rowH, "F")
      try { doc.setFont("NotoSans", "bold") } catch {}
      doc.setFontSize(10).setTextColor(0, 0, 0)
      doc.text(sectionTitle, MARGIN + 2, currentY + 5)
      currentY += rowH

      // Items
      try { doc.setFont("NotoSans", "normal") } catch {}
      doc.setFontSize(9).setTextColor(0, 0, 0)
      for (const it of items) {
        const label = normalizeTextForPdf(it.label || it.name || "-")
        const rawState = it.state as any
        const state =
          rawState === true
            ? "functional"
            : rawState === false
              ? "nefunctional"
              : (rawState || "na") as "functional" | "nefunctional" | "na"
        const obs = normalizeTextForPdf(it.obs || "")

        const labelLines = doc.splitTextToSize(label, firstColW - 4)
        const obsLines = obs ? doc.splitTextToSize(obs, obsW - 4) : []
        const numLines = Math.max(labelLines.length, obsLines.length || 0)
        const lineHeight = 4 // aproximativ pentru fontSize 9
        const baseRow = 8
        const dynamic = numLines > 1 ? 5 + (numLines - 1) * lineHeight : baseRow
        const heightNeeded = Math.max(baseRow, dynamic)

        checkBreak(heightNeeded)
        try { doc.setFont("NotoSans", "normal") } catch {}
        doc.setFontSize(9).setTextColor(0, 0, 0)

        doc.setDrawColor(210, 210, 210).setLineWidth(0.2)
        doc.rect(MARGIN, currentY, W, heightNeeded)

        doc.text(labelLines, MARGIN + 2, currentY + 5)

        const verX = MARGIN + firstColW
        try { doc.setFont("NotoSans", "bold") } catch {}
        const isFunctional = state === "functional"
        const isNonFunctional = state === "nefunctional"
        const cx = verX + verW / 2
        const cy = currentY + 5
        if (isFunctional) {
          doc.setDrawColor(22, 163, 74).setLineWidth(0.6)
          doc.line(cx - 3, cy - 1, cx - 1, cy + 2)
          doc.line(cx - 1, cy + 2, cx + 3, cy - 3)
        } else if (isNonFunctional) {
          doc.setDrawColor(220, 38, 38).setLineWidth(0.6)
          doc.line(cx - 3, cy - 3, cx + 3, cy + 3)
          doc.line(cx - 3, cy + 3, cx + 3, cy - 3)
        }
        doc.setTextColor(0, 0, 0)

        try { doc.setFont("NotoSans", "normal") } catch {}
        if (obsLines.length) {
          doc.text(obsLines, MARGIN + firstColW + verW + 2, currentY + 5)
        }

        currentY += heightNeeded
      }
    }

    // Footer per page
    drawFooter(doc)
    if (idx < revisions.length - 1) {
      doc.addPage()
      currentY = MARGIN
    }
  }

  return doc.output("blob")
}

function docRef(collectionName: string, id: string) {
  return doc(db, collectionName, id)
}

/**
 * Generate a single‑equipment PDF sheet for a given lucrare and equipmentId.
 */
export async function generateRevisionEquipmentPDF(
  lucrareId: string,
  equipmentId: string,
  opts?: { headerLabelOverride?: string; sheetNumberLabel?: string }
): Promise<Blob> {
  const js = new jsPDF({ unit: "mm", format: "a4" })
  let currentY = MARGIN
  await ensurePdfFont(js)
  try { js.setFont("NotoSans", "normal") } catch {}

  // Load single revision
  const revSnap = await getDoc(doc(db, "lucrari", lucrareId, "revisions", equipmentId))
  if (!revSnap.exists()) {
    // Return an empty PDF with a note
    // Try to include logo even for the empty case
    let emptyLogo: string | null = null
    try {
      const resp = await fetch("/nrglogo.png")
      const bl = await resp.blob()
      emptyLogo = await new Promise((resolve) => {
        const fr = new FileReader()
        fr.onload = () => resolve(fr.result as string)
        fr.readAsDataURL(bl)
      })
    } catch {}
    const missingHeaderTitle = buildEquipmentSheetHeaderTitle(
      "Nivel 2 — Fie categorii, fie variabile",
      opts?.sheetNumberLabel
    )
    currentY = drawSimpleHeader(js, { title: missingHeaderTitle, logoDataUrl: emptyLogo })
    try { js.setFont("NotoSans", "normal") } catch {}
    js.setFontSize(10)
    js.text(normalizeTextForPdf("Fișa de operațiuni nu a fost găsită pentru acest echipament."), MARGIN + 2, currentY + 4)
    drawOpsFooter(js)
    return js.output("blob")
  }
  const rev = { id: revSnap.id, ...(revSnap.data() as any) } as any

  // Header: Lista operațiuni – {Nivel 2} (categorie sau primul puncte de control când nu există categorii)
  const sectionsForHeader = Array.isArray(rev.sections) ? rev.sections : []
  const level2Label = resolveHeaderLabel(
    { ...rev, headerOverride: opts?.headerLabelOverride },
    sectionsForHeader
  )
  const title = buildEquipmentSheetHeaderTitle(level2Label, opts?.sheetNumberLabel)
  let logoDataUrl: string | null = null
  try {
    const resp = await fetch("/nrglogo.png")
    const bl = await resp.blob()
    logoDataUrl = await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.readAsDataURL(bl)
    })
  } catch {}
  currentY = drawSimpleHeader(js, { title, logoDataUrl })

  const checkBreak = (need: number) => {
    const PH = js.internal.pageSize.getHeight()
    if (currentY + need > PH - MARGIN - 30) {
      drawFooter(js)
      js.addPage()
      currentY = drawSimpleHeader(js, { title, logoDataUrl })
      // Reset text state after header so we don't inherit footer/header styles
      try { js.setFont("NotoSans", "normal") } catch {}
      js.setFontSize(9).setTextColor(0, 0, 0)
    }
  }

  // Table header
  const rowH = 8
  const W = CONTENT_WIDTH
  const firstColW = Math.round(W * 0.62)
  const verW = 22
  const obsW = W - firstColW - verW

  js.setFillColor(220, 227, 240)
  js.rect(MARGIN, currentY, W, rowH, "F")
  try { js.setFont("NotoSans", "bold") } catch {}
  js.setFontSize(10).setTextColor(0, 0, 0)
  
  js.text(normalizeTextForPdf("Puncte de control"), MARGIN + 2, currentY + 5)
  js.text(normalizeTextForPdf("Verificat"), MARGIN + firstColW + verW / 2, currentY + 5, { align: "center" } as any)
  js.text(normalizeTextForPdf("Obs."), MARGIN + firstColW + verW + 2, currentY + 5)
  
  currentY += rowH

  const sections = Array.isArray(rev.sections) ? rev.sections : []

  // Helper pentru măsurarea înălțimii unui item (folosit ca să evităm ruperea secțiunilor pe pagini)
  const measureItemHeightJs = (it: any): number => {
    const label = normalizeTextForPdf(it.label || it.name || "-")
    const obs = normalizeTextForPdf(it.obs || "")
    const labelLines = js.splitTextToSize(label, firstColW - 4)
    const obsLines = obs ? js.splitTextToSize(obs, obsW - 4) : []
    const numLines = Math.max(labelLines.length, obsLines.length || 0)
    const lineHeight = 4
    const baseRow = 8
    const dynamic = numLines > 1 ? 5 + (numLines - 1) * lineHeight : baseRow
    return Math.max(baseRow, dynamic)
  }

  for (const s of sections) {
    const sectionTitle = normalizeTextForPdf(s.title || s.name || "Secțiune")
    const items = Array.isArray(s.items) ? s.items : []

    // Înălțimea totală a secțiunii (header + toate item-urile)
    const sectionHeight = rowH + items.reduce((sum, it) => sum + measureItemHeightJs(it), 0)
    // Dacă nu încape întreaga secțiune pe pagină, mutăm pe pagina următoare
    checkBreak(sectionHeight)

    js.setFillColor(240, 240, 240)
    js.rect(MARGIN, currentY, W, rowH, "F")
    try { js.setFont("NotoSans", "bold") } catch {}
    js.setFontSize(10).setTextColor(0, 0, 0)
    js.text(sectionTitle, MARGIN + 2, currentY + 5)
    currentY += rowH

    try { js.setFont("NotoSans", "normal") } catch {}
    js.setFontSize(9).setTextColor(0, 0, 0)
    for (const it of items) {
      const label = normalizeTextForPdf(it.label || it.name || "-")
      const rawState = it.state as any
      const state =
        rawState === true
          ? "functional"
          : rawState === false
            ? "nefunctional"
            : (rawState || "na") as "functional" | "nefunctional" | "na"
      const obs = normalizeTextForPdf(it.obs || "")

      const labelLines = js.splitTextToSize(label, firstColW - 4)
      const obsLines = obs ? js.splitTextToSize(obs, obsW - 4) : []
      const numLines = Math.max(labelLines.length, obsLines.length || 0)
      const lineHeight = 4
      const baseRow = 8
      const dynamic = numLines > 1 ? 5 + (numLines - 1) * lineHeight : baseRow
      const heightNeeded = Math.max(baseRow, dynamic)
      checkBreak(heightNeeded)
      try { js.setFont("NotoSans", "normal") } catch {}
      js.setFontSize(9).setTextColor(0, 0, 0)

      js.setDrawColor(210, 210, 210).setLineWidth(0.2)
      js.rect(MARGIN, currentY, W, heightNeeded)

      js.text(labelLines, MARGIN + 2, currentY + 5)

      const verX = MARGIN + firstColW
      try { js.setFont("NotoSans", "bold") } catch {}
      const isFunctional = state === "functional"
      const isNonFunctional = state === "nefunctional"
      const cx = verX + verW / 2
      const cy = currentY + 5
      if (isFunctional) {
        js.setDrawColor(22, 163, 74).setLineWidth(0.6)
        js.line(cx - 3, cy - 1, cx - 1, cy + 2)
        js.line(cx - 1, cy + 2, cx + 3, cy - 3)
      } else if (isNonFunctional) {
        js.setDrawColor(220, 38, 38).setLineWidth(0.6)
        js.line(cx - 3, cy - 3, cx + 3, cy + 3)
        js.line(cx - 3, cy + 3, cx + 3, cy - 3)
      }
      js.setTextColor(0, 0, 0)

      try { js.setFont("NotoSans", "normal") } catch {}
      if (obsLines.length) {
        js.text(obsLines, MARGIN + firstColW + verW + 2, currentY + 5)
      }

      currentY += heightNeeded
    }
  }

  drawFooter(js)
  return js.output("blob")
}

