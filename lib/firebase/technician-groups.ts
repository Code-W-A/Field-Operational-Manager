import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"

export const TECHNICIAN_GROUPS_COLLECTION = "technician_groups"

export interface TechnicianGroup {
  id: string
  name: string
  sortOrder: number
  createdAt?: unknown
}

export function sortTechnicianGroups(groups: TechnicianGroup[]): TechnicianGroup[] {
  return [...groups].sort((a, b) => {
    const o = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    if (o !== 0) return o
    return String(a.name || "").localeCompare(String(b.name || ""), "ro", { sensitivity: "base" })
  })
}

export function subscribeTechnicianGroups(
  onData: (groups: TechnicianGroup[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, TECHNICIAN_GROUPS_COLLECTION), orderBy("sortOrder", "asc"))
  return onSnapshot(
    q,
    (snap) => {
      const list: TechnicianGroup[] = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>
        return {
          id: d.id,
          name: String(data.name ?? ""),
          sortOrder: typeof data.sortOrder === "number" ? data.sortOrder : 0,
          createdAt: data.createdAt,
        }
      })
      onData(sortTechnicianGroups(list))
    },
    (err) => {
      console.error("[technician-groups] snapshot error", err)
      onError?.(err)
    },
  )
}

export async function createTechnicianGroup(name: string, sortOrder: number): Promise<string> {
  const ref = await addDoc(collection(db, TECHNICIAN_GROUPS_COLLECTION), {
    name: name.trim(),
    sortOrder,
    createdAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateTechnicianGroup(id: string, name: string, sortOrder: number): Promise<void> {
  await updateDoc(doc(db, TECHNICIAN_GROUPS_COLLECTION, id), {
    name: name.trim(),
    sortOrder,
  })
}

export async function deleteTechnicianGroupDoc(id: string): Promise<void> {
  await deleteDoc(doc(db, TECHNICIAN_GROUPS_COLLECTION, id))
}

/** Scoate groupId din technicianGroupIds pentru toți tehnicienii (înainte de ștergerea grupului). */
export async function removeGroupIdFromAllTechnicians(groupId: string): Promise<void> {
  const snap = await getDocs(query(collection(db, "users"), where("role", "==", "tehnician")))
  let batch = writeBatch(db)
  let count = 0
  for (const d of snap.docs) {
    const data = d.data() as { technicianGroupIds?: string[] }
    const ids = Array.isArray(data.technicianGroupIds) ? data.technicianGroupIds.map(String) : []
    if (!ids.includes(groupId)) continue
    const next = ids.filter((x) => x !== groupId)
    batch.update(d.ref, {
      technicianGroupIds: next,
      updatedAt: serverTimestamp(),
    })
    count++
    if (count >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      count = 0
    }
  }
  if (count > 0) await batch.commit()
}

/** Primul grup din lista sortată căruia îi aparține tehnicianul (pentru afișare unică în Select). */
export function primaryDisplayGroupId(
  sortedGroupIds: string[],
  technicianGroupIds: string[] | undefined,
): string | null {
  const set = new Set((technicianGroupIds || []).map(String))
  for (const gid of sortedGroupIds) {
    if (set.has(gid)) return gid
  }
  return null
}
