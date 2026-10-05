"use client"
import { auth } from "@/lib/firebase/config"

export async function installationRequest(path: string, body?: unknown, method = "POST"): Promise<any> {
  const token = await auth.currentUser?.getIdToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (!(body instanceof FormData) && body !== undefined) headers["Content-Type"] = "application/json"
  const response = await fetch(path, { method: body === undefined ? "GET" : method, headers, credentials: "same-origin", cache: "no-store", body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || "Operația de instalare a eșuat.")
  return result
}
export const installationApi = (workId: string) => `/api/lucrari/${encodeURIComponent(workId)}/installation`
