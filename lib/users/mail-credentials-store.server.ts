import { FieldValue, type Timestamp } from "firebase-admin/firestore"
import { adminDb } from "@/lib/firebase/admin"
import { decryptSecret, encryptSecret } from "@/lib/users/mail-credentials-crypto.server"

export const MAIL_CREDENTIALS_DOC_ID = "settings"

export type MailCredentialsStored = {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPasswordEnc?: string
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapPasswordEnc?: string
  updatedAt?: Timestamp
  updatedByUid?: string
}

export type MailCredentialsPublic = {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpHasPassword: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapHasPassword: boolean
}

function ref(userId: string) {
  return adminDb.collection("users").doc(userId).collection("mailCredentials").doc(MAIL_CREDENTIALS_DOC_ID)
}

export async function getMailCredentialsForUser(userId: string): Promise<MailCredentialsPublic | null> {
  const snap = await ref(userId).get()
  if (!snap.exists) return null
  const d = snap.data() as MailCredentialsStored
  return {
    smtpHost: String(d.smtpHost || ""),
    smtpPort: Number.isFinite(d.smtpPort) ? d.smtpPort : 465,
    smtpSecure: Boolean(d.smtpSecure !== false),
    smtpUser: String(d.smtpUser || ""),
    smtpHasPassword: Boolean(d.smtpPasswordEnc),
    imapHost: String(d.imapHost || ""),
    imapPort: Number.isFinite(d.imapPort) ? d.imapPort : 993,
    imapSecure: Boolean(d.imapSecure !== false),
    imapUser: String(d.imapUser || ""),
    imapHasPassword: Boolean(d.imapPasswordEnc),
  }
}

export type SaveMailCredentialsInput = {
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  smtpUser: string
  smtpPassword?: string
  clearSmtpPassword?: boolean
  imapHost: string
  imapPort: number
  imapSecure: boolean
  imapUser: string
  imapPassword?: string
  clearImapPassword?: boolean
}

export async function saveMailCredentialsForUser(
  userId: string,
  payload: SaveMailCredentialsInput,
  actorUid: string,
): Promise<void> {
  const docRef = ref(userId)

  const next: Record<string, unknown> = {
    smtpHost: payload.smtpHost.trim(),
    smtpPort: payload.smtpPort,
    smtpSecure: payload.smtpSecure,
    smtpUser: payload.smtpUser.trim(),
    imapHost: payload.imapHost.trim(),
    imapPort: payload.imapPort,
    imapSecure: payload.imapSecure,
    imapUser: payload.imapUser.trim(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: actorUid,
  }

  if (payload.clearSmtpPassword) {
    next.smtpPasswordEnc = FieldValue.delete()
  } else if (typeof payload.smtpPassword === "string" && payload.smtpPassword.trim() !== "") {
    next.smtpPasswordEnc = encryptSecret(payload.smtpPassword.trim())
  }

  if (payload.clearImapPassword) {
    next.imapPasswordEnc = FieldValue.delete()
  } else if (typeof payload.imapPassword === "string" && payload.imapPassword.trim() !== "") {
    next.imapPasswordEnc = encryptSecret(payload.imapPassword.trim())
  }

  await docRef.set(next, { merge: true })
}

export async function deleteMailCredentialsForUser(userId: string): Promise<void> {
  await ref(userId).delete()
}

/** Pentru faza 2: decriptare parole la trimitere email */
export async function getMailCredentialsDecrypted(userId: string): Promise<
  | (MailCredentialsPublic & { smtpPassword?: string; imapPassword?: string })
  | null
> {
  const snap = await ref(userId).get()
  if (!snap.exists) return null
  const d = snap.data() as MailCredentialsStored
  const pub = await getMailCredentialsForUser(userId)
  if (!pub) return null
  let smtpPassword: string | undefined
  let imapPassword: string | undefined
  if (d.smtpPasswordEnc) {
    try {
      smtpPassword = decryptSecret(d.smtpPasswordEnc)
    } catch {
      smtpPassword = undefined
    }
  }
  if (d.imapPasswordEnc) {
    try {
      imapPassword = decryptSecret(d.imapPasswordEnc)
    } catch {
      imapPassword = undefined
    }
  }
  return { ...pub, smtpPassword, imapPassword }
}
