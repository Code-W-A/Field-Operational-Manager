import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json(
    { error: "Confirmarea post-răspuns este trimisă și auditată server-side în /api/offer/respond." },
    { status: 410 },
  )
}
