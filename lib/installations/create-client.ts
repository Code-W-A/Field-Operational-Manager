"use client"
import type { Lucrare } from "@/lib/firebase/firestore"
import { installationRequest } from "./client"

const pending = new Map<string, string>()
export async function createInstallationTicket(work: Lucrare): Promise<Lucrare> {
  const clean = JSON.parse(JSON.stringify(work))
  const key = JSON.stringify(clean)
  const requestId = pending.get(key) || crypto.randomUUID()
  pending.set(key, requestId)
  const result = await installationRequest("/api/installation", { work: clean, requestId })
  pending.delete(key)
  return result as Lucrare
}
