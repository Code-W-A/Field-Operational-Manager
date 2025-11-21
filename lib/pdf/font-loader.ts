import { jsPDF } from "jspdf"

let fontReady = false

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Font download failed: ${res.status}`)
  const buf = await res.arrayBuffer()
  let binary = ""
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[])
  }
  return btoa(binary)
}

/**
 * Loads a Unicode font and aliases it as "helvetica" in jsPDF so existing code keeps working.
 * Registers normal and bold weights.
 */
export async function ensurePdfFont(doc: jsPDF): Promise<void> {
  if (fontReady) return
  try {
    // Use latin-ext subset to include Romanian diacritics (ă â î ș ț)
    const regularUrl =
      "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.ttf"
    const boldUrl =
      "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.ttf"

    const [regB64, boldB64] = await Promise.all([fetchAsBase64(regularUrl), fetchAsBase64(boldUrl)])
    doc.addFileToVFS("NotoSans-Regular.ttf", regB64)
    doc.addFileToVFS("NotoSans-Bold.ttf", boldB64)

    // Register with their own family
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal")
    doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold")

    // Alias over 'helvetica' to avoid touching existing code
    doc.addFont("NotoSans-Regular.ttf", "helvetica", "normal")
    doc.addFont("NotoSans-Bold.ttf", "helvetica", "bold")

    doc.setFont("helvetica", "normal")
    fontReady = true
  } catch (e) {
    // Fallback silently; diacritics may be stripped if network fails
    console.warn("PDF font load failed, fallback to default:", e)
  }
}


