import { jsPDF } from "jspdf"

let fontCache: { regB64: string; boldB64: string } | null = null
let fontLoadPromise: Promise<void> | null = null

async function serverImport<T>(specifier: string): Promise<T> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<T>
  return dynamicImport(specifier)
}

async function fetchAsBase64(url: string): Promise<string> {
  if (typeof window === "undefined" && url.startsWith("/")) {
    const [{ readFile }, path] = await Promise.all([
      serverImport<typeof import("node:fs/promises")>("node:fs/promises"),
      serverImport<typeof import("node:path")>("node:path"),
    ])
    const filePath = path.join(process.cwd(), "public", url.replace(/^\/+/, ""))
    const buf = await readFile(filePath)
    return buf.toString("base64")
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Font download failed: ${res.status}`)
  const buf = await res.arrayBuffer()
  if (typeof window === "undefined") {
    return Buffer.from(buf).toString("base64")
  }
  let binary = ""
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[])
  }
  return btoa(binary)
}

async function loadFontCache(): Promise<void> {
  if (fontCache) return
  
  try {
    console.log("📥 Încărcare font pentru diacritice românești...")
    // 1) Încearcă local public/fonts (recomandat)
    const localPairs: Array<[string, string]> = [
      ["/fonts/NotoSans-Regular.ttf", "/fonts/NotoSans-Bold.ttf"],
      ["/fonts/Roboto-Regular.ttf", "/fonts/Roboto-Bold.ttf"],
      ["/fonts/DejaVuSans.ttf", "/fonts/DejaVuSans-Bold.ttf"],
    ]
    // 2) Fallback surse fiabile (GitHub raw - CORS permis) pentru TTF
    const remotePairs: Array<[string, string]> = [
      ["https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Regular.ttf", "https://raw.githubusercontent.com/google/fonts/main/ofl/notosans/NotoSans-Bold.ttf"],
      ["https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Regular.ttf", "https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Bold.ttf"],
      ["https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/version_2_37/ttf/DejaVuSans.ttf", "https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/version_2_37/ttf/DejaVuSans-Bold.ttf"],
    ]

    const tryPairs = async (pairs: Array<[string, string]>): Promise<{ regB64: string; boldB64: string } | null> => {
      for (const [regUrl, boldUrl] of pairs) {
        try {
          const [regB64, boldB64] = await Promise.all([fetchAsBase64(regUrl), fetchAsBase64(boldUrl)])
          return { regB64, boldB64 }
        } catch {
          // try next pair
        }
      }
      return null
    }

    let loaded = await tryPairs(localPairs)
    if (!loaded) {
      console.warn("⚠️ Fonturile locale lipsesc/nu pot fi citite. Încerc surse remote (GitHub raw, TTF)...")
      loaded = await tryPairs(remotePairs)
    }

    if (!loaded) {
      throw new Error("Nu s-a putut încărca niciun font TTF pentru PDF (local sau remote).")
    }

    fontCache = { regB64: loaded.regB64, boldB64: loaded.boldB64 }
    console.log("✅ Font PDF încărcat cu succes (diacritice suportate)")
  } catch (e) {
    console.error("❌ Eroare la încărcarea fontului Noto Sans:", e)
    throw e
  }
}

/**
 * Loads a Unicode font and aliases it as "helvetica" in jsPDF so existing code keeps working.
 * Registers normal and bold weights.
 */
export async function ensurePdfFont(doc: jsPDF): Promise<void> {
  // Încărcăm fontul în cache dacă nu e deja încărcat
  if (!fontLoadPromise) {
    fontLoadPromise = loadFontCache()
  }
  
  try {
    await fontLoadPromise
    
    if (!fontCache) {
      console.warn("⚠️ Font cache gol, folosim fontul implicit fără diacritice")
      return
    }

    // Adăugăm fontul în documentul PDF curent
    doc.addFileToVFS("NotoSans-Regular.ttf", fontCache.regB64)
    doc.addFileToVFS("NotoSans-Bold.ttf", fontCache.boldB64)

    // Register with their own family
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal")
    doc.addFont("NotoSans-Bold.ttf", "NotoSans", "bold")

    // Alias over 'helvetica' to avoid touching existing code
    doc.addFont("NotoSans-Regular.ttf", "helvetica", "normal")
    doc.addFont("NotoSans-Bold.ttf", "helvetica", "bold")

    try { doc.setFont("NotoSans", "normal") } catch { try { doc.setFont("helvetica", "normal") } catch {} }
    console.log("✅ Font aplicat cu succes în document PDF")
  } catch (e) {
    // Fallback silently; diacritics may be stripped if network fails
    console.warn("⚠️ PDF font load failed, fallback to default (fără diacritice):", e)
  }
}
