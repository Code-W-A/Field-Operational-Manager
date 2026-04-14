import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

const ALGO = "aes-256-gcm"
const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32

function getKeyMaterial(): Buffer {
  const raw = String(process.env.USER_EMAIL_SECRETS_KEY || "").trim()
  if (!raw) {
    throw new Error("USER_EMAIL_SECRETS_KEY lipsește din variabilele de mediu")
  }
  try {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, "hex")
    }
    const b64 = Buffer.from(raw, "base64")
    if (b64.length === KEY_LEN) return b64
  } catch {
    /* fall through */
  }
  return scryptSync(raw, "user-email-secrets", KEY_LEN)
}

let cachedKey: Buffer | null = null

function secretKey(): Buffer {
  if (!cachedKey) cachedKey = getKeyMaterial()
  if (cachedKey.length !== KEY_LEN) {
    throw new Error("USER_EMAIL_SECRETS_KEY trebuie să fie 32 octeți (base64) sau 64 caractere hex")
  }
  return cachedKey
}

/** Format: base64(iv|tag|ciphertext) — toate concatenated */
export function encryptSecret(plain: string): string {
  const key = secretKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  const out = Buffer.concat([iv, tag, enc])
  return out.toString("base64")
}

export function decryptSecret(encoded: string): string {
  const key = secretKey()
  const buf = Buffer.from(encoded, "base64")
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Date cifrate invalide")
  }
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const data = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
