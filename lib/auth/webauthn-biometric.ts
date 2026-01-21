export type BiometricVerifyResult =
  | { ok: true; auditId: string }
  | { ok: false; error: string }

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function base64UrlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)
  const bin = atob(padded)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function randomChallenge(len = 32): Uint8Array {
  const b = new Uint8Array(len)
  crypto.getRandomValues(b)
  return b
}

function storageKey(userId: string) {
  return `fom.webauthn.credId.v1:${userId}`
}

export function isWebAuthnBiometricAvailable(): boolean {
  if (typeof window === "undefined") return false
  const isSecure = window.isSecureContext || window.location.hostname === "localhost"
  return Boolean(
    isSecure &&
      window.PublicKeyCredential &&
      typeof navigator.credentials?.create === "function" &&
      typeof navigator.credentials?.get === "function",
  )
}

async function getOrCreateCredentialId(params: { userId: string; userName: string }): Promise<string> {
  const { userId, userName } = params
  const key = storageKey(userId)
  const existing = typeof window !== "undefined" ? window.localStorage.getItem(key) : null
  if (existing) return existing

  // Register a platform authenticator credential (passkey) locally.
  const rpId = window.location.hostname
  const userIdBytes = utf8Bytes(userId).slice(0, 64)

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: { name: "FOM", id: rpId },
      user: { id: userIdBytes, name: userId, displayName: userName || userId },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null

  if (!credential?.rawId) throw new Error("Nu s-a putut înregistra biometria pe acest dispozitiv.")

  const credId = base64UrlEncode(credential.rawId)
  window.localStorage.setItem(key, credId)
  return credId
}

export async function verifyWithDeviceBiometrics(params: {
  userId: string
  userName: string
}): Promise<BiometricVerifyResult> {
  if (!isWebAuthnBiometricAvailable()) {
    return { ok: false, error: "Biometria device-ului nu este disponibilă în acest browser/PWA." }
  }

  try {
    const credId = await getOrCreateCredentialId(params)
    const allowId = base64UrlDecode(credId)

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        allowCredentials: [{ type: "public-key", id: allowId, transports: ["internal"] }],
        userVerification: "required",
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null

    if (!assertion) return { ok: false, error: "Verificarea biometrică a fost anulată." }
    // We treat successful userVerification as a gate. No biometric data is stored.
    return { ok: true, auditId: `bio_${params.userId}_${Date.now()}` }
  } catch (e: any) {
    const name = String(e?.name || "")
    if (name === "NotAllowedError") return { ok: false, error: "Verificarea biometrică a fost anulată." }
    if (name === "InvalidStateError")
      return { ok: false, error: "Biometria nu este configurată pe acest dispozitiv pentru această aplicație." }
    return { ok: false, error: e instanceof Error ? e.message : "Nu am putut face verificarea biometrică." }
  }
}

