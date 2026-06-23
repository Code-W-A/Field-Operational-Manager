import { NextResponse } from "next/server"

/**
 * Proxy same-origin pentru imagini din Firebase Storage.
 *
 * Motiv: la generarea PDF-ului (jsPDF) avem nevoie de octeții imaginii ca dataURL.
 * `fetch(storageUrl, { mode: "cors" })` direct din browser eșuează când bucket-ul
 * nu are configurate anteturi CORS pentru originea aplicației, lăsând în raport
 * doar cadre goale. Trecând prin acest endpoint (aceeași origine) evităm complet
 * problema CORS, iar octeții ajung la client pentru a fi încorporați în PDF.
 *
 * Securitate (anti-SSRF): acceptăm doar host-uri Firebase/Google Storage.
 */
const ALLOWED_HOSTS = new Set([
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
])

function isAllowedUrl(value: string): URL | null {
  try {
    const u = new URL(value)
    if (u.protocol !== "https:") return null
    if (!ALLOWED_HOSTS.has(u.hostname)) return null
    return u
  } catch {
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get("url") || ""
  if (!raw) {
    return NextResponse.json({ error: "Parametru `url` lipsă" }, { status: 400 })
  }

  const target = isAllowedUrl(raw)
  if (!target) {
    return NextResponse.json({ error: "URL nepermis" }, { status: 403 })
  }

  try {
    const upstream = await fetch(target.toString(), { cache: "no-store" })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: "Imaginea nu a putut fi încărcată din Storage", status: upstream.status },
        { status: 502 },
      )
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream"
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Conținutul nu este o imagine" }, { status: 415 })
    }

    const buffer = await upstream.arrayBuffer()
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=300",
      },
    })
  } catch (e) {
    console.error("[IMAGE-PROXY] fetch failed", e)
    return NextResponse.json({ error: "Eroare la proxy imagine" }, { status: 500 })
  }
}
