import type { SyncRecord } from "@/firebase-functions/src/client-ticket-sync"

export function linkedClientId(work: SyncRecord): string {
  return String(work.clientId || work.clientInfo?.id || "").trim()
}

/** Build once per collection update, then resolve/count in O(clients + works). */
export function createClientIndex(clients: SyncRecord[]) {
  const byId = new Map<string, SyncRecord>()
  const byName = new Map<string, SyncRecord | null>()
  for (const client of clients) {
    if (client.id) byId.set(String(client.id), client)
    if (client.nume) byName.set(client.nume, byName.has(client.nume) ? null : client)
  }
  return {
    resolve(work: SyncRecord): SyncRecord | null {
      const id = linkedClientId(work)
      // A bad/deleted ID never falls through to another client's matching name.
      return id ? byId.get(id) || null : byName.get(work.client) || null
    },
  }
}

export function withClientWorkCounts<T extends SyncRecord>(clients: T[], works: SyncRecord[]): (T & { numarLucrari: number })[] {
  const index = createClientIndex(clients)
  const counts = new Map<string, number>()
  for (const work of works) {
    const id = index.resolve(work)?.id
    if (id) counts.set(id, (counts.get(id) || 0) + 1)
  }
  return clients.map(client => ({ ...client, numarLucrari: counts.get(client.id) || 0 }))
}
