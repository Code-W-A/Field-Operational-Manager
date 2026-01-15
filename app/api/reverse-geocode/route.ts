import { NextResponse } from "next/server"

function toNumber(value: string | null): number | null {
  if (!value) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = toNumber(searchParams.get("lat"))
  const lng = toNumber(searchParams.get("lng"))

  if (lat == null || lng == null) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(
        String(lat)
      )}&lon=${encodeURIComponent(String(lng))}`,
      {
        headers: {
          "User-Agent": "FOM-App/1.0",
          "Accept-Language": "ro",
        },
      }
    )

    if (!response.ok) {
      return NextResponse.json({ error: "Geocoding failed" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json({
      display_name: data?.display_name || null,
      raw: data,
    })
  } catch {
    return NextResponse.json({ error: "Geocoding error" }, { status: 500 })
  }
}
