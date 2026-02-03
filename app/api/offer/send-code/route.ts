import { NextResponse, type NextRequest } from "next/server"
import nodemailer from "nodemailer"
import { adminDb } from "@/lib/firebase/admin"
import { getEmailFrom } from "@/lib/email/from"

const CODE_LENGTH = 6
const CODE_TTL_MS = 15 * 60 * 1000
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

const generateCode = () => {
  let out = ""
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  }
  return out
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

export async function POST(req: NextRequest) {
  try {
    const { lucrareId, token, email } = await req.json()
    if (!lucrareId || !token || !email || !isValidEmail(String(email))) {
      return NextResponse.json({ status: "invalid", message: "Parametri lipsă sau email invalid." }, { status: 400 })
    }

    const workRef = adminDb.collection("lucrari").doc(String(lucrareId))
    const workSnap = await workRef.get()
    if (!workSnap.exists) {
      return NextResponse.json({ status: "invalid", message: "Lucrarea nu există." }, { status: 404 })
    }

    const data: any = workSnap.data()
    if (!data.offerActionToken || data.offerActionToken !== token) {
      return NextResponse.json({ status: "invalid", message: "Link invalid sau utilizat." }, { status: 400 })
    }
    if (data.offerActionUsedAt) {
      return NextResponse.json({ status: "used", message: "Oferta a fost deja acceptată sau refuzată." }, { status: 409 })
    }
    const exp = data.offerActionExpiresAt ? (
      typeof data.offerActionExpiresAt.toDate === "function" ? data.offerActionExpiresAt.toDate() : new Date(data.offerActionExpiresAt)
    ) : null
    if (exp && Date.now() > exp.getTime()) {
      return NextResponse.json({ status: "expired", message: "Link expirat." }, { status: 410 })
    }

    const cleanEmail = String(email).trim().toLowerCase()
    const code = generateCode()
    const crypto = await import("crypto")
    const codeHash = crypto.createHash("sha256").update(`${code}:${cleanEmail}`).digest("hex")
    const now = new Date()
    const expiresAt = new Date(Date.now() + CODE_TTL_MS)

    await workRef.update({
      offerActionVerification: {
        email: cleanEmail,
        codeHash,
        codeSentAt: now,
        codeExpiresAt: expiresAt,
        verifiedAt: null,
      },
    })

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || "mail.nrg-acces.ro",
      port: Number(process.env.EMAIL_PORT || 465),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER || "fom@nrg-acces.ro",
        pass: process.env.EMAIL_PASS || "FOM@nrg25",
      },
    })

    const subject = "Cod validare ofertă"
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0b1220">
        <p>Pentru validarea ofertei, vă rugăm să introduceți codul de mai jos în pagina de confirmare:</p>
        <p style="font-size:20px;font-weight:700;letter-spacing:2px">${code}</p>
        <p>Codul este valabil timp de 15 minute.</p>
      </div>
    `

    await transporter.sendMail({
      from: getEmailFrom(),
      to: [cleanEmail],
      subject,
      html,
      text: `Pentru validarea ofertei, introduceți codul: ${code}. Codul este valabil 15 minute.`,
    })

    return NextResponse.json({ status: "sent" })
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        message: "Eroare server la trimiterea codului.",
        error: { message: String(error?.message || error) },
      },
      { status: 500 },
    )
  }
}
