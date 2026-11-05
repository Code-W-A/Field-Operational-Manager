export type AndroidUpdatePolicy = {
  enabled: boolean
  minimumAndroidVersionCode: number
  message: string
}

export const DEFAULT_POLICY: AndroidUpdatePolicy = {
  enabled: false,
  minimumAndroidVersionCode: 1,
  message: "Actualizează aplicația pentru a continua.",
}

export function parsePolicy(value: unknown): AndroidUpdatePolicy | null {
  if (!value || typeof value !== "object") return null
  const p = value as Record<string, unknown>
  if (typeof p.enabled !== "boolean" ||
      !Number.isSafeInteger(p.minimumAndroidVersionCode) ||
      (p.minimumAndroidVersionCode as number) < 1 ||
      (p.minimumAndroidVersionCode as number) > 2100000000 ||
      typeof p.message !== "string" || !p.message.trim() || p.message.trim().length > 500) return null
  return { enabled: p.enabled, minimumAndroidVersionCode: p.minimumAndroidVersionCode as number, message: p.message.trim() }
}
